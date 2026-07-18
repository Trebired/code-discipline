import ts from "typescript";

function isFunctionLikeWithBody(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    (ts.isFunctionDeclaration(node) && node.body !== undefined)
    || (ts.isMethodDeclaration(node) && node.body !== undefined)
    || (ts.isConstructorDeclaration(node) && node.body !== undefined)
    || (ts.isGetAccessorDeclaration(node) && node.body !== undefined)
    || (ts.isSetAccessorDeclaration(node) && node.body !== undefined)
    || (ts.isFunctionExpression(node) && node.body !== undefined)
    || (ts.isArrowFunction(node) && node.body !== undefined)
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

export { isFunctionLikeWithBody, resolveFunctionKind };
