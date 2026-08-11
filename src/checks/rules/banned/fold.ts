import ts from "typescript";

type FoldedStringMatchKind = "concat" | "identifier" | "join" | "template";

type FoldedStringMatch = {
  value: string;
  line: number;
  kind: FoldedStringMatchKind;
};

function isPlusBinary(node: ts.Node): node is ts.BinaryExpression {
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function foldArrayOfStrings(node: ts.Expression, bindings: ReadonlyMap<string, string>): string[] | null {
  if (!ts.isArrayLiteralExpression(node)) return null;

  const parts: string[] = [];
  for (const element of node.elements) {
    const folded = tryFoldExpression(element, bindings);
    if (folded === null) return null;
    parts.push(folded);
  }

  return parts;
}

function tryFoldJoinCall(node: ts.CallExpression, bindings: ReadonlyMap<string, string>): string | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== "join") return null;

  const items = foldArrayOfStrings(node.expression.expression, bindings);
  if (items === null) return null;

  if (node.arguments.length > 1) return null;

  let separator = ",";
  if (node.arguments.length === 1) {
    const foldedSeparator = tryFoldExpression(node.arguments[0]!, bindings);
    if (foldedSeparator === null) return null;
    separator = foldedSeparator;
  }

  return items.join(separator);
}

function tryFoldExpression(node: ts.Expression, bindings: ReadonlyMap<string, string>): string | null {
  if (ts.isParenthesizedExpression(node)) {
    return tryFoldExpression(node.expression, bindings);
  }

  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (isPlusBinary(node)) {
    const left = tryFoldExpression(node.left, bindings);
    if (left === null) return null;

    const right = tryFoldExpression(node.right, bindings);
    if (right === null) return null;

    return left + right;
  }

  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      const folded = tryFoldExpression(span.expression, bindings);
      if (folded === null) return null;
      result += folded + span.literal.text;
    }
    return result;
  }

  if (ts.isCallExpression(node)) {
    return tryFoldJoinCall(node, bindings);
  }

  if (ts.isIdentifier(node)) {
    return bindings.get(node.text) ?? null;
  }

  return null;
}

function isIdentifierValueReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;

  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.name === node) return false;
  if (ts.isParameter(parent) && parent.name === node) return false;
  const parentIsNamedExpression =
  ts.isFunctionDeclaration(parent)
  ||ts.isClassDeclaration(parent)
  ||ts.isFunctionExpression(parent)
  ||ts.isClassExpression(parent);
  if (parentIsNamedExpression && parent.name === node) return false;
  if (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) return false;
  if (ts.isImportClause(parent) && parent.name === node) return false;
  if (ts.isNamespaceImport(parent) && parent.name === node) return false;
  if (ts.isLabeledStatement(parent) && parent.label === node) return false;
  if (ts.isBreakOrContinueStatement(parent) && parent.label === node) return false;
  if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent)) return false;
  if (ts.isQualifiedName(parent) && parent.right === node) return false;

  return true;
}

function addBindingName(name: ts.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text);
    return;
  }

  for (const element of name.elements) {
    if (ts.isBindingElement(element)) addBindingName(element.name, names);
  }
}

function collectNestedDeclaredNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  function visitNested(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) addBindingName(node.name, names);
    if (ts.isParameter(node)) addBindingName(node.name, names);
    if (ts.isCatchClause(node) && node.variableDeclaration) addBindingName(node.variableDeclaration.name, names);
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) names.add(node.name.text);
    if (ts.isImportSpecifier(node)) names.add(node.name.text);
    if (ts.isImportClause(node) && node.name) names.add(node.name.text);
    if (ts.isNamespaceImport(node)) names.add(node.name.text);

    ts.forEachChild(node, visitNested);
  }

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer) visitNested(declaration.initializer);
      }
      continue;
    }

    visitNested(statement);
  }

  return names;
}

function collectTopLevelSafeConstBindings(sourceFile: ts.SourceFile): Map<string, string> {
  const candidates: Array<{name:string;initializer:ts.Expression}> = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if ((ts.getCombinedNodeFlags(statement.declarationList)&ts.NodeFlags.Const) === 0) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      candidates.push({ name: declaration.name.text, initializer: declaration.initializer });
    }
  }

  const bindings = new Map<string, string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const candidate of candidates) {
      if (bindings.has(candidate.name)) continue;

      const folded = tryFoldExpression(candidate.initializer, bindings);
      if (folded !== null) {
        bindings.set(candidate.name, folded);
        changed = true;
      }
    }
  }

  for (const shadowedName of collectNestedDeclaredNames(sourceFile)) {
    bindings.delete(shadowedName);
  }

  return bindings;
}

function resolveMatchKind(node: ts.Node): FoldedStringMatchKind {
  if (ts.isCallExpression(node)) return "join";
  if (ts.isTemplateExpression(node)) return "template";
  if (ts.isIdentifier(node)) return "identifier";
  return "concat";
}

function isFoldableSiteCandidate(node: ts.Node, bindings: ReadonlyMap<string, string>): node is ts.Expression {
  if (ts.isCallExpression(node) || ts.isTemplateExpression(node) || isPlusBinary(node)) return true;
  return ts.isIdentifier(node) && bindings.has(node.text) && isIdentifierValueReference(node);
}

function collectFoldedStringMatches(sourceFile: ts.SourceFile): FoldedStringMatch[] {
  const bindings = collectTopLevelSafeConstBindings(sourceFile);
  const matches: FoldedStringMatch[] = [];

  function visit(node: ts.Node): void {
    if (isFoldableSiteCandidate(node, bindings)) {
      const folded = tryFoldExpression(node, bindings);
      if (folded !== null) {
        matches.push({
            value: folded,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            kind: resolveMatchKind(node),
        });
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

export { collectFoldedStringMatches };
export type { FoldedStringMatch, FoldedStringMatchKind };
