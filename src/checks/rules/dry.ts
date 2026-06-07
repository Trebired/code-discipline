import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import type {
  DryHelperReference,
  FixCodeDisciplineRuleResult,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedDryRule,
} from "../types.js";
import type { ScannedSourceFile } from "../../imports/types.js";
import { parseSource } from "../../imports/module-specifiers.js";
import { resolveRelativeImport } from "../../imports/resolve.js";
import type { CodeDisciplineViolation } from "../../shared/discipline-types.js";
import {
  FixFailureError,
  InvalidCodeDisciplineConfigError,
} from "../../shared/errors.js";
import {
  isFile,
  stableSerialize,
  stripKnownExtension,
  toPosixPath,
} from "../../shared/utils.js";

const DRY_RESOLUTION_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".cts",
  ".cjs",
];

const SAFE_GLOBAL_IDENTIFIERS = new Set([
  "Array",
  "BigInt",
  "Boolean",
  "Date",
  "Error",
  "JSON",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "RangeError",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "SyntaxError",
  "TypeError",
  "URL",
  "URLSearchParams",
  "WeakMap",
  "WeakSet",
  "console",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
]);

type DryHelperDescriptor = {
  absolutePath: string;
  exportName: string;
  fingerprint: string;
  filePath: string;
  helperKey: string;
  importPath: string;
  localName: string;
  nodeEnd: number;
  nodeStart: number;
};

type DryCandidateDescriptor = {
  absolutePath: string;
  classification: "method" | "standalone" | "unsupported";
  fingerprint: string | null;
  filePath: string;
  helper: DryHelperDescriptor;
  localName?: string;
  nonFixableReason?: string;
  removalEnd: number;
  removalStart: number;
  safeToFix: boolean;
  sourceFile: ts.SourceFile;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
};

type ImportBinding = {
  exportName: string;
  localName: string;
};

type SerializeContext = {
  nextBindingIndex: number;
  scopes: Array<Map<string, string>>;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
};

function createSerializeContext(): SerializeContext {
  return {
    nextBindingIndex: 0,
    scopes: [],
    usesOuterScope: false,
    usesRestrictedRuntime: false,
  };
}

function pushScope(context: SerializeContext): void {
  context.scopes.push(new Map());
}

function popScope(context: SerializeContext): void {
  context.scopes.pop();
}

function declareBinding(context: SerializeContext, name: string): string {
  const canonical = `v${context.nextBindingIndex}`;
  context.nextBindingIndex += 1;
  context.scopes[context.scopes.length - 1]?.set(name, canonical);
  return canonical;
}

function lookupBinding(context: SerializeContext, name: string): string | null {
  for (let index = context.scopes.length - 1; index >= 0; index -= 1) {
    const match = context.scopes[index]?.get(name);
    if (match) return match;
  }

  return null;
}

function isReferenceIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;

  if (
    (ts.isFunctionDeclaration(parent)
      || ts.isFunctionExpression(parent)
      || ts.isArrowFunction(parent)
      || ts.isMethodDeclaration(parent)
      || ts.isGetAccessorDeclaration(parent)
      || ts.isSetAccessorDeclaration(parent)
      || ts.isParameter(parent)
      || ts.isVariableDeclaration(parent)
      || ts.isBindingElement(parent))
    && parent.name === node
  ) {
    return false;
  }

  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) {
    return false;
  }

  if ((ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isQualifiedName(parent) && parent.right === node)) {
    return false;
  }

  if (ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
    return true;
  }

  if ((ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node))
    || (ts.isImportClause(parent) && parent.name === node)
    || (ts.isNamespaceImport(parent) && parent.name === node)
    || (ts.isExportSpecifier(parent) && (parent.name === node || parent.propertyName === node))) {
    return false;
  }

  return true;
}

function serializeBindingName(name: ts.BindingName, context: SerializeContext, sourceFile: ts.SourceFile): unknown {
  if (ts.isIdentifier(name)) {
    return ["id", declareBinding(context, name.text)];
  }

  if (ts.isObjectBindingPattern(name)) {
    return [
      "object-binding",
      name.elements.map((element) => serializeBindingElement(element, context, sourceFile)),
    ];
  }

  return [
    "array-binding",
    name.elements.map((element) => (element && ts.isBindingElement(element)) ? serializeBindingElement(element, context, sourceFile) : ["hole"]),
  ];
}

function serializeBindingElement(
  element: ts.BindingElement,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
): unknown {
  return [
    "binding-element",
    element.dotDotDotToken ? "rest" : "value",
    element.propertyName ? serializePropertyName(element.propertyName, context, sourceFile) : null,
    serializeBindingName(element.name, context, sourceFile),
    element.initializer ? serializeNode(element.initializer, context, sourceFile) : null,
  ];
}

function serializePropertyName(
  name: ts.PropertyName,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
): unknown {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }

  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  if (ts.isComputedPropertyName(name)) {
    return ["computed", serializeNode(name.expression, context, sourceFile)];
  }

  return name.getText(sourceFile);
}

function serializeFunctionLike(
  node: ts.FunctionLikeDeclaration,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
): unknown {
  const isAsync = Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword));
  const isGenerator = ts.isFunctionLike(node) && "asteriskToken" in node && Boolean(node.asteriskToken);
  pushScope(context);

  const parameters = node.parameters.map((parameter) => [
    "param",
    parameter.dotDotDotToken ? "rest" : "value",
    serializeBindingName(parameter.name, context, sourceFile),
    parameter.initializer ? serializeNode(parameter.initializer, context, sourceFile) : null,
  ]);

  const body = node.body
    ? serializeNode(node.body, context, sourceFile)
    : null;

  popScope(context);

  return [
    "function",
    isAsync,
    isGenerator,
    parameters,
    body,
  ];
}

function serializeNode(
  node: ts.Node | undefined,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
): unknown {
  if (!node) return null;

  if (
    ts.isTypeNode(node)
    || ts.isTypeParameterDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isInterfaceDeclaration(node)
    || ts.isImportTypeNode(node)
  ) {
    return null;
  }

  if (ts.isBlock(node)) {
    pushScope(context);
    const result = ["block", node.statements.map((statement) => serializeNode(statement, context, sourceFile))];
    popScope(context);
    return result;
  }

  if (ts.isReturnStatement(node)) {
    return ["return", serializeNode(node.expression, context, sourceFile)];
  }

  if (ts.isExpressionStatement(node)) {
    return ["expr", serializeNode(node.expression, context, sourceFile)];
  }

  if (ts.isVariableStatement(node)) {
    return ["vars", node.declarationList.flags, node.declarationList.declarations.map((declaration) => serializeNode(declaration, context, sourceFile))];
  }

  if (ts.isVariableDeclaration(node)) {
    return [
      "var",
      serializeBindingName(node.name, context, sourceFile),
      serializeNode(node.initializer, context, sourceFile),
    ];
  }

  if (ts.isIfStatement(node)) {
    return [
      "if",
      serializeNode(node.expression, context, sourceFile),
      serializeNode(node.thenStatement, context, sourceFile),
      serializeNode(node.elseStatement, context, sourceFile),
    ];
  }

  if (ts.isForStatement(node)) {
    return [
      "for",
      serializeNode(node.initializer, context, sourceFile),
      serializeNode(node.condition, context, sourceFile),
      serializeNode(node.incrementor, context, sourceFile),
      serializeNode(node.statement, context, sourceFile),
    ];
  }

  if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    return [
      ts.isForOfStatement(node) ? "for-of" : "for-in",
      serializeNode(node.initializer, context, sourceFile),
      serializeNode(node.expression, context, sourceFile),
      serializeNode(node.statement, context, sourceFile),
    ];
  }

  if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
    return [
      ts.isWhileStatement(node) ? "while" : "do",
      serializeNode(node.expression, context, sourceFile),
      serializeNode(node.statement, context, sourceFile),
    ];
  }

  if (ts.isThrowStatement(node)) {
    return ["throw", serializeNode(node.expression, context, sourceFile)];
  }

  if (ts.isTryStatement(node)) {
    return [
      "try",
      serializeNode(node.tryBlock, context, sourceFile),
      node.catchClause
        ? [
          "catch",
          node.catchClause.variableDeclaration
            ? serializeBindingName(node.catchClause.variableDeclaration.name, context, sourceFile)
            : null,
          serializeNode(node.catchClause.block, context, sourceFile),
        ]
        : null,
      serializeNode(node.finallyBlock, context, sourceFile),
    ];
  }

  if (ts.isSwitchStatement(node)) {
    return [
      "switch",
      serializeNode(node.expression, context, sourceFile),
      node.caseBlock.clauses.map((clause) => (
        ts.isCaseClause(clause)
          ? ["case", serializeNode(clause.expression, context, sourceFile), clause.statements.map((statement) => serializeNode(statement, context, sourceFile))]
          : ["default", clause.statements.map((statement) => serializeNode(statement, context, sourceFile))]
      )),
    ];
  }

  if (ts.isParenthesizedExpression(node)) {
    return serializeNode(node.expression, context, sourceFile);
  }

  if (ts.isIdentifier(node)) {
    if (node.text === "arguments") {
      context.usesRestrictedRuntime = true;
    }

    if (!isReferenceIdentifier(node)) {
      return node.text;
    }

    const local = lookupBinding(context, node.text);
    if (local) {
      return ["local", local];
    }

    if (node.text === "arguments") {
      return ["restricted", "arguments"];
    }

    if (SAFE_GLOBAL_IDENTIFIERS.has(node.text)) {
      return ["global", node.text];
    }

    context.usesOuterScope = true;
    return ["outer", node.text];
  }

  if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword) {
    context.usesRestrictedRuntime = true;
    return ["restricted", ts.SyntaxKind[node.kind]];
  }

  if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.NewKeyword && node.name.text === "target") {
    context.usesRestrictedRuntime = true;
    return ["restricted", "new.target"];
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)) {
    return ["literal", node.text];
  }

  if (ts.isBigIntLiteral(node)) {
    return ["literal", node.text];
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) {
    return ["literal", ts.tokenToString(node.kind) ?? ts.SyntaxKind[node.kind]];
  }

  if (ts.isTemplateExpression(node)) {
    return [
      "template",
      node.head.text,
      node.templateSpans.map((span) => [
        serializeNode(span.expression, context, sourceFile),
        span.literal.text,
      ]),
    ];
  }

  if (ts.isArrayLiteralExpression(node)) {
    return [
      "array",
      node.elements.map((element) => (
        ts.isSpreadElement(element)
          ? ["spread", serializeNode(element.expression, context, sourceFile)]
          : serializeNode(element, context, sourceFile)
      )),
    ];
  }

  if (ts.isObjectLiteralExpression(node)) {
    return [
      "object",
      node.properties.map((property) => {
        if (ts.isPropertyAssignment(property)) {
          return ["prop", serializePropertyName(property.name, context, sourceFile), serializeNode(property.initializer, context, sourceFile)];
        }

        if (ts.isShorthandPropertyAssignment(property)) {
          return [
            "shorthand",
            property.name.text,
            serializeNode(property.name, context, sourceFile),
          ];
        }

        if (ts.isSpreadAssignment(property)) {
          return ["spread-assignment", serializeNode(property.expression, context, sourceFile)];
        }

        if (ts.isMethodDeclaration(property)) {
          return ["method", serializePropertyName(property.name, context, sourceFile), serializeFunctionLike(property, context, sourceFile)];
        }

        return ["property", property.getText(sourceFile)];
      }),
    ];
  }

  if (ts.isPropertyAccessExpression(node)) {
    return ["property-access", serializeNode(node.expression, context, sourceFile), node.name.text];
  }

  if (ts.isElementAccessExpression(node)) {
    return ["element-access", serializeNode(node.expression, context, sourceFile), serializeNode(node.argumentExpression, context, sourceFile)];
  }

  if (ts.isCallExpression(node)) {
    return [
      "call",
      serializeNode(node.expression, context, sourceFile),
      node.arguments.map((argument) => serializeNode(argument, context, sourceFile)),
    ];
  }

  if (ts.isNewExpression(node)) {
    return [
      "new",
      serializeNode(node.expression, context, sourceFile),
      (node.arguments ?? []).map((argument) => serializeNode(argument, context, sourceFile)),
    ];
  }

  if (ts.isAwaitExpression(node)) {
    return ["await", serializeNode(node.expression, context, sourceFile)];
  }

  if (ts.isYieldExpression(node)) {
    return ["yield", node.asteriskToken ? "*" : "", serializeNode(node.expression, context, sourceFile)];
  }

  if (ts.isConditionalExpression(node)) {
    return [
      "conditional",
      serializeNode(node.condition, context, sourceFile),
      serializeNode(node.whenTrue, context, sourceFile),
      serializeNode(node.whenFalse, context, sourceFile),
    ];
  }

  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return [
      ts.isPrefixUnaryExpression(node) ? "prefix" : "postfix",
      ts.tokenToString(node.operator) ?? String(node.operator),
      serializeNode(node.operand, context, sourceFile),
    ];
  }

  if (ts.isBinaryExpression(node)) {
    return [
      "binary",
      ts.tokenToString(node.operatorToken.kind) ?? String(node.operatorToken.kind),
      serializeNode(node.left, context, sourceFile),
      serializeNode(node.right, context, sourceFile),
    ];
  }

  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return serializeFunctionLike(node, context, sourceFile);
  }

  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
    return serializeNode(node.expression, context, sourceFile);
  }

  if (ts.isClassExpression(node) || ts.isClassDeclaration(node)) {
    return ["class", node.name?.text ?? null];
  }

  return [
    ts.SyntaxKind[node.kind],
    node.getChildren(sourceFile).map((child) => serializeNode(child, context, sourceFile)),
  ];
}

function createFunctionFingerprint(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
): {
  fingerprint: string;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
} {
  const context = createSerializeContext();
  const normalized = serializeFunctionLike(node, context, sourceFile);

  return {
    fingerprint: stableSerialize(normalized),
    usesOuterScope: context.usesOuterScope,
    usesRestrictedRuntime: context.usesRestrictedRuntime,
  };
}

function resolveStandaloneName(node: ts.FunctionLikeDeclaration): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) {
    return node.name.text;
  }

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }

  return undefined;
}

function resolveClassification(node: ts.FunctionLikeDeclaration): "method" | "standalone" | "unsupported" {
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node)) {
    return "method";
  }

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return "standalone";
  }

  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return resolveStandaloneName(node) ? "standalone" : "unsupported";
  }

  return "unsupported";
}

function resolveRemovalRange(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): { start: number; end: number; ok: boolean } {
  if (ts.isFunctionDeclaration(node) && node.parent) {
    return {
      start: node.getFullStart(),
      end: expandRemovalEnd(sourceFile.text, node.getEnd()),
      ok: true,
    };
  }

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) {
    const declarationList = parent.parent;
    const statement = declarationList?.parent;
    const isSingleDeclaration = ts.isVariableDeclarationList(declarationList)
      && declarationList.declarations.length === 1
      && ts.isVariableStatement(statement);

    if (!isSingleDeclaration) {
      return {
        start: parent.getStart(sourceFile),
        end: parent.getEnd(),
        ok: false,
      };
    }

    return {
      start: statement.getFullStart(),
      end: expandRemovalEnd(sourceFile.text, statement.getEnd()),
      ok: true,
    };
  }

  return {
    start: node.getStart(sourceFile),
    end: node.getEnd(),
    ok: false,
  };
}

function expandRemovalEnd(text: string, end: number): number {
  if (text.slice(end, end + 2) === "\r\n") return end + 2;
  if (text[end] === "\n") return end + 1;
  return end;
}

async function resolveDryHelperModulePath(reference: DryHelperReference, options: NormalizedCheckCodeDisciplineOptions): Promise<string> {
  const baseDir = options.configPath ? path.dirname(options.configPath) : options.projectRoot;
  const basePath = path.isAbsolute(reference.from)
    ? path.resolve(reference.from)
    : path.resolve(baseDir, reference.from);
  const candidates = [basePath];

  if (!path.extname(basePath)) {
    for (const extension of DRY_RESOLUTION_EXTENSIONS) {
      candidates.push(`${basePath}${extension}`);
    }

    for (const extension of DRY_RESOLUTION_EXTENSIONS) {
      candidates.push(path.join(basePath, `index${extension}`));
    }
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }

  throw new InvalidCodeDisciplineConfigError(`dry helper module was not found: ${reference.from}`, {
    rule: "dry",
    from: reference.from,
  });
}

function extractSupportedExportedFunction(
  sourceFile: ts.SourceFile,
  exportName: string,
): ts.FunctionLikeDeclaration | null {
  for (const statement of sourceFile.statements) {
    if (exportName === "default" && ts.isExportAssignment(statement)) {
      const expression = statement.expression;
      if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
        return expression;
      }
    }

    if (ts.isFunctionDeclaration(statement) && statement.name?.text === exportName && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      return statement;
    }

    if (ts.isVariableStatement(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName || !declaration.initializer) continue;
        if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
          return declaration.initializer;
        }
      }
    }

    if (exportName === "default" && ts.isFunctionDeclaration(statement) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      return statement;
    }
  }

  return null;
}

async function resolveDryHelpers(
  rule: NormalizedDryRule,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<Map<string, DryHelperDescriptor>> {
  const helpers = new Map<string, DryHelperDescriptor>();

  for (const reference of rule.helpers) {
    const absolutePath = await resolveDryHelperModulePath(reference, options);
    const sourceText = await fs.readFile(absolutePath, "utf8");
    const sourceFile = parseSource(sourceText, absolutePath);
    const exportedFunction = extractSupportedExportedFunction(sourceFile, reference.exportName);

    if (!exportedFunction) {
      throw new InvalidCodeDisciplineConfigError(`dry helper export is not a supported function: ${reference.from}#${reference.exportName}`, {
        rule: "dry",
        exportName: reference.exportName,
        from: reference.from,
      });
    }

    const fingerprintState = createFunctionFingerprint(exportedFunction, sourceFile);
    const helperKey = reference.key || `${reference.from}#${reference.exportName}`;
    const localName = reference.exportName === "default"
      ? resolveStandaloneName(exportedFunction) || "default"
      : reference.exportName;

    if (helpers.has(fingerprintState.fingerprint)) {
      const existing = helpers.get(fingerprintState.fingerprint)!;
      throw new InvalidCodeDisciplineConfigError(`dry helper fingerprint collision: ${helperKey} conflicts with ${existing.helperKey}`, {
        rule: "dry",
      });
    }

    helpers.set(fingerprintState.fingerprint, {
      absolutePath,
      exportName: reference.exportName,
      fingerprint: fingerprintState.fingerprint,
      filePath: toPosixPath(path.relative(options.projectRoot, absolutePath)),
      helperKey,
      importPath: reference.from,
      localName,
      nodeEnd: exportedFunction.getEnd(),
      nodeStart: exportedFunction.getStart(sourceFile),
    });
  }

  return helpers;
}

function createDryViolation(
  candidate: DryCandidateDescriptor,
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation {
  return {
    rule: "dry",
    severity: options.rules.dry?.severity ?? "error",
    fix: options.rules.dry?.fix ?? false,
    filePath: candidate.filePath,
    message: `${candidate.localName ?? "anonymous function"} duplicates registered helper ${candidate.helper.helperKey}`,
    details: {
      fixable: candidate.safeToFix,
      helper: candidate.helper.helperKey,
      helperFile: candidate.helper.filePath,
      reason: candidate.nonFixableReason,
    },
  };
}

async function collectDryCandidates(
  sourceFiles: ScannedSourceFile[],
  helpers: Map<string, DryHelperDescriptor>,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<DryCandidateDescriptor[]> {
  const results: DryCandidateDescriptor[] = [];

  for (const file of sourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(text, file.absolutePath);

    function visit(node: ts.Node) {
      if (
        (ts.isFunctionDeclaration(node) && node.body)
        || (ts.isFunctionExpression(node) && node.body)
        || (ts.isArrowFunction(node) && node.body)
        || (ts.isMethodDeclaration(node) && node.body)
        || (ts.isGetAccessorDeclaration(node) && node.body)
        || (ts.isSetAccessorDeclaration(node) && node.body)
        || (ts.isConstructorDeclaration(node) && node.body)
      ) {
        const classification = resolveClassification(node);
        const localName = resolveStandaloneName(node);
        const removal = resolveRemovalRange(node, sourceFile);
        const fingerprintState = createFunctionFingerprint(node, sourceFile);
        const helper = helpers.get(fingerprintState.fingerprint);

        if (helper) {
          const isSelf = helper.absolutePath === file.absolutePath
            && helper.nodeStart === node.getStart(sourceFile)
            && helper.nodeEnd === node.getEnd();

          if (!isSelf) {
            const safeToFix = classification === "standalone"
              && removal.ok
              && !fingerprintState.usesOuterScope
              && !fingerprintState.usesRestrictedRuntime
              && Boolean(localName);

            let nonFixableReason: string | undefined;
            if (classification === "method") {
              nonFixableReason = "methods are report-only in v1";
            } else if (classification !== "standalone") {
              nonFixableReason = "unsupported function shape";
            } else if (!removal.ok) {
              nonFixableReason = "duplicate declaration cannot be removed safely";
            } else if (fingerprintState.usesOuterScope) {
              nonFixableReason = "duplicate captures outer scope";
            } else if (fingerprintState.usesRestrictedRuntime) {
              nonFixableReason = "duplicate depends on this, super, arguments, or new.target";
            }

            results.push({
              absolutePath: file.absolutePath,
              classification,
              fingerprint: fingerprintState.fingerprint,
              filePath: file.relativeFromProjectRoot,
              helper,
              localName,
              nonFixableReason,
              removalEnd: removal.end,
              removalStart: removal.start,
              safeToFix,
              sourceFile,
              usesOuterScope: fingerprintState.usesOuterScope,
              usesRestrictedRuntime: fingerprintState.usesRestrictedRuntime,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return results;
}

function formatRelativeImport(fromAbsolutePath: string, toAbsolutePath: string, extensions: string[]): string {
  let relativePath = toPosixPath(path.relative(path.dirname(fromAbsolutePath), toAbsolutePath));
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }

  const withoutExtension = stripKnownExtension(relativePath, extensions);
  return withoutExtension.replace(/\/index$/, "") || ".";
}

async function collectExistingImports(
  sourceFile: ts.SourceFile,
  filePath: string,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<Map<string, ImportBinding[]>> {
  const bindingsByTarget = new Map<string, ImportBinding[]>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const resolved = await resolveRelativeImport(statement.moduleSpecifier.text, filePath, {
      projectRoot: options.projectRoot,
      sourceRoot: options.sourceRoot,
      sourceRootRelative: options.sourceRootRelative,
      sourceExtensions: options.sourceExtensions,
      excludeDirs: options.excludeDirs,
    } as any);
    if (!resolved) continue;

    const bindings = bindingsByTarget.get(resolved) ?? [];
    const clause = statement.importClause;
    if (!clause) continue;

    if (clause.name) {
        bindings.push({
          exportName: "default",
          localName: clause.name.text,
        });
    }

    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        bindings.push({
          exportName: element.propertyName?.text ?? element.name.text,
          localName: element.name.text,
        });
      }
    }

    bindingsByTarget.set(resolved, bindings);
  }

  return bindingsByTarget;
}

function collectTopLevelValueBindings(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
      continue;
    }

    if (ts.isImportDeclaration(statement) && statement.importClause) {
      if (statement.importClause.name) {
        names.add(statement.importClause.name.text);
      }

      if (statement.importClause.namedBindings) {
        if (ts.isNamespaceImport(statement.importClause.namedBindings)) {
          names.add(statement.importClause.namedBindings.name.text);
        } else {
          for (const element of statement.importClause.namedBindings.elements) {
            names.add(element.name.text);
          }
        }
      }

      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBoundNamesFromBindingName(declaration.name, names);
      }
    }
  }

  return names;
}

function collectBoundNamesFromBindingName(name: ts.BindingName, target: Set<string>): void {
  if (ts.isIdentifier(name)) {
    target.add(name.text);
    return;
  }

  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (!element || !ts.isBindingElement(element)) continue;
      collectBoundNamesFromBindingName(element.name, target);
    }
  }
}

function findImportInsertionOffset(sourceFile: ts.SourceFile, text: string): number {
  const imports = sourceFile.statements.filter((statement) => ts.isImportDeclaration(statement));
  if (imports.length > 0) {
    return imports[imports.length - 1]!.getEnd();
  }

  let offset = 0;
  if (text.startsWith("#!")) {
    const newlineIndex = text.indexOf("\n");
    offset = newlineIndex >= 0 ? newlineIndex + 1 : text.length;
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      offset = statement.getEnd();
      continue;
    }

    break;
  }

  return offset;
}

async function fixDryRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const rule = options.rules.dry;
  if (!rule) {
    return {
      ok: true,
      errors: 0,
      warnings: 0,
      violations: [],
    };
  }

  const helpers = await resolveDryHelpers(rule, options);
  const candidates = await collectDryCandidates(sourceFiles, helpers, options);
  const violations = candidates.map((candidate) => createDryViolation(candidate, options));
  const warnings = violations.filter((violation) => violation.severity === "warning").length;
  const errors = violations.length - warnings;

  if (violations.length === 0) {
    return {
      ok: true,
      errors: 0,
      warnings: 0,
      violations: [],
      added_imports: 0,
      removed_duplicates: 0,
    };
  }

  if (!rule.fix) {
    return {
      ok: errors === 0,
      errors,
      warnings,
      violations,
      added_imports: 0,
      removed_duplicates: 0,
    };
  }

  const candidatesByFile = new Map<string, DryCandidateDescriptor[]>();
  const fixedCandidates = new Set<DryCandidateDescriptor>();

  for (const candidate of candidates.filter((entry) => entry.safeToFix)) {
    const rows = candidatesByFile.get(candidate.absolutePath) ?? [];
    rows.push(candidate);
    candidatesByFile.set(candidate.absolutePath, rows);
  }

  let addedImports = 0;
  let removedDuplicates = 0;
  let rewrittenFiles = 0;

  try {
    for (const [absolutePath, fileCandidates] of candidatesByFile) {
      const originalText = await fs.readFile(absolutePath, "utf8");
      const sourceFile = fileCandidates[0]!.sourceFile;
      const existingImports = await collectExistingImports(sourceFile, absolutePath, options);
      const topLevelBindings = collectTopLevelValueBindings(sourceFile);
      const pendingImports = new Map<string, string>();
      const removals: Array<{ start: number; end: number }> = [];

      for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name) {
          const matchingCandidate = fileCandidates.find((candidate) => candidate.localName === statement.name?.text && candidate.removalStart === statement.getFullStart());
          if (matchingCandidate) {
            topLevelBindings.delete(statement.name.text);
          }
        }

        if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
          const declaration = statement.declarationList.declarations[0]!;
          if (!ts.isIdentifier(declaration.name)) continue;
          const variableName = declaration.name.text;
          const matchingCandidate = fileCandidates.find((candidate) => candidate.localName === variableName && candidate.removalStart === statement.getFullStart());
          if (matchingCandidate) {
            topLevelBindings.delete(variableName);
          }
        }
      }

      for (const candidate of fileCandidates.sort((left, right) => right.removalStart - left.removalStart)) {
        if (!candidate.localName) continue;

        if (candidate.helper.absolutePath === absolutePath) {
          if (candidate.localName !== candidate.helper.localName) {
            continue;
          }

          removals.push({
            start: candidate.removalStart,
            end: candidate.removalEnd,
          });
          fixedCandidates.add(candidate);
          removedDuplicates += 1;
          continue;
        }

        const existingHelperBindings = existingImports.get(candidate.helper.absolutePath) ?? [];
        const alreadyImported = existingHelperBindings.some((binding) => binding.exportName === candidate.helper.exportName && binding.localName === candidate.localName);

        if (!alreadyImported) {
          if (topLevelBindings.has(candidate.localName)) {
            continue;
          }

          const importSpecifier = formatRelativeImport(absolutePath, candidate.helper.absolutePath, options.sourceExtensions);
          const importLine = candidate.helper.exportName === "default"
            ? `import ${candidate.localName} from "${importSpecifier}";\n`
            : candidate.localName === candidate.helper.exportName
              ? `import { ${candidate.helper.exportName} } from "${importSpecifier}";\n`
              : `import { ${candidate.helper.exportName} as ${candidate.localName} } from "${importSpecifier}";\n`;

          pendingImports.set(`${candidate.helper.absolutePath}::${candidate.localName}`, importLine);
          topLevelBindings.add(candidate.localName);
        }

        removals.push({
          start: candidate.removalStart,
          end: candidate.removalEnd,
        });
        fixedCandidates.add(candidate);
        removedDuplicates += 1;
      }

      if (removals.length === 0 && pendingImports.size === 0) {
        continue;
      }

      let nextText = originalText;
      for (const removal of removals.sort((left, right) => right.start - left.start)) {
        nextText = `${nextText.slice(0, removal.start)}${nextText.slice(removal.end)}`;
      }

      if (pendingImports.size > 0) {
        const insertionOffset = findImportInsertionOffset(sourceFile, originalText);
        const prefix = nextText.slice(0, insertionOffset);
        const suffix = nextText.slice(insertionOffset);
        const importBlock = `${prefix.endsWith("\n") || insertionOffset === 0 ? "" : "\n"}${[...pendingImports.values()].join("")}`;
        nextText = `${prefix}${importBlock}${suffix.startsWith("\n") ? "" : "\n"}${suffix}`;
        addedImports += pendingImports.size;
      }

      if (nextText !== originalText) {
        await fs.writeFile(absolutePath, nextText);
        rewrittenFiles += 1;
      }
    }
  } catch (error) {
    throw new FixFailureError("DRY fix failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const remainingViolations = candidates
    .filter((candidate) => !fixedCandidates.has(candidate))
    .map((candidate) => createDryViolation(candidate, options));
  const remainingWarnings = remainingViolations.filter((violation) => violation.severity === "warning").length;
  const remainingErrors = remainingViolations.length - remainingWarnings;

  return {
    ok: remainingErrors === 0,
    errors: remainingErrors,
    warnings: remainingWarnings,
    violations: remainingViolations,
    added_imports: addedImports,
    removed_duplicates: removedDuplicates,
    rewritten_files: rewrittenFiles,
  };
}

async function collectDryViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.rules.dry;
  if (!rule) return [];

  const helpers = await resolveDryHelpers(rule, options);
  const candidates = await collectDryCandidates(sourceFiles, helpers, options);
  return candidates.map((candidate) => createDryViolation(candidate, options));
}

export { collectDryViolations, fixDryRule };
