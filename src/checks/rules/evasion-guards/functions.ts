import ts from "typescript";

import { isFunctionLikeWithBody, resolveFunctionKind } from "../typescript-functions.js";

type FunctionDescriptor = {
  characterCount: number;
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  statementCount: number;
};

function getStartLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getLineCount(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
  return Math.max(1, endLine - startLine + 1);
}

function resolveFunctionName(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  if ("name" in node && node.name) return node.name.getText(sourceFile);

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (parent && ts.isBinaryExpression(parent) && ts.isIdentifier(parent.left)) return parent.left.text;
  if (parent && ts.isPropertyAssignment(parent)) return parent.name.getText(sourceFile);
  return "anonymous";
}

function countExecutableStatements(node: ts.Node): number {
  let count = 0;

  function visit(child: ts.Node) {
    if (ts.isStatement(child) && !ts.isBlock(child)) count += 1;
    ts.forEachChild(child, visit);
  }

  ts.forEachChild(node, visit);
  return count;
}

function describeFunction(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): FunctionDescriptor {
  const body = node.body;
  const statementCount = body && ts.isBlock(body)
    ? countExecutableStatements(body)
    : 1;

  return {
    characterCount: node.getText(sourceFile).length,
    kind: resolveFunctionKind(node),
    lineCount: getLineCount(sourceFile, node),
    name: resolveFunctionName(node, sourceFile),
    startLine: getStartLine(sourceFile, node),
    statementCount,
  };
}

function collectFunctionDescriptors(sourceFile: ts.SourceFile): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];

  function visit(node: ts.Node) {
    if (isFunctionLikeWithBody(node)) descriptors.push(describeFunction(node, sourceFile));
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return descriptors;
}

export { collectFunctionDescriptors, getStartLine };
export type { FunctionDescriptor };
