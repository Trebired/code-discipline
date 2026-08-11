import ts from "typescript";

function isFunctionLikeWithBody(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    (ts.isFunctionDeclaration(node) && node.body !== undefined)
    ||(ts.isMethodDeclaration(node) && node.body !== undefined)
    ||(ts.isConstructorDeclaration(node) && node.body !== undefined)
    ||(ts.isGetAccessorDeclaration(node) && node.body !== undefined)
    ||(ts.isSetAccessorDeclaration(node) && node.body !== undefined)
    ||(ts.isFunctionExpression(node) && node.body !== undefined)
    ||(ts.isArrowFunction(node) && node.body !== undefined)
  );
}

function resolveFunctionKind(node: ts.FunctionLikeDeclaration): string {
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isGetAccessorDeclaration(node)) return "getter";
  if (ts.isSetAccessorDeclaration(node)) return "setter";
  if (ts.isArrowFunction(node)) return "arrow-function";
  if (ts.isFunctionExpression(node)) return "function-expression";
  return "function";
}

function getStartLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getEndLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}

function getLineCount(sourceFile: ts.SourceFile, node: ts.Node): number {
  return Math.max(1, getEndLine(sourceFile, node) - getStartLine(sourceFile, node) + 1);
}

function resolveFunctionName(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  if ("name"in node && node.name) {
    return node.name.getText(sourceFile);
  }

  const parent = node.parent;

  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }

  if (parent && ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left)) {
    return parent.left.text;
  }

  if (parent && ts.isPropertyAssignment(parent)) {
    return parent.name.getText(sourceFile);
  }

  return "anonymous";
}

export {
  getEndLine,
  getLineCount,
  getStartLine,
  isFunctionLikeWithBody,
  resolveFunctionKind,
  resolveFunctionName,
};
