import ts from "typescript";

type SerializeContext = {
  nextBindingIndex: number;
  scopes: Array<Map<string, string>>;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
};

type SerializeNodeFn = (
  node: ts.Node | undefined,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
) => unknown;

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

function isDeclarationNameOfParent(node: ts.Identifier, parent: ts.Node): boolean {
  return (ts.isFunctionDeclaration(parent)
    ||ts.isFunctionExpression(parent)
    ||ts.isArrowFunction(parent)
    ||ts.isMethodDeclaration(parent)
    ||ts.isGetAccessorDeclaration(parent)
    ||ts.isSetAccessorDeclaration(parent)
    ||ts.isParameter(parent)
    ||ts.isVariableDeclaration(parent)
    ||ts.isBindingElement(parent))
  &&parent.name === node;
}

function isImportOrExportName(node: ts.Identifier, parent: ts.Node): boolean {
  return (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node))
  ||(ts.isImportClause(parent) && parent.name === node)
  ||(ts.isNamespaceImport(parent) && parent.name === node)
  ||(ts.isExportSpecifier(parent) && (parent.name === node || parent.propertyName === node));
}

function isReferenceIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return true;

  if (isDeclarationNameOfParent(node, parent)) {
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

  if (isImportOrExportName(node, parent)) {
    return false;
  }

  return true;
}

export {
  SAFE_GLOBAL_IDENTIFIERS,
  createSerializeContext,
  declareBinding,
  isReferenceIdentifier,
  lookupBinding,
  popScope,
  pushScope,
};
export type { SerializeContext, SerializeNodeFn };
