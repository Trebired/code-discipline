import ts from "typescript";

import {
  getLineCount,
  getStartLine,
  isFunctionLikeWithBody,
  resolveFunctionKind,
  resolveFunctionName,
} from "../typescript-functions.js";

type FunctionDescriptor = {
  characterCount: number;
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  statementCount: number;
};

function countExecutableStatements(node: ts.Node): number {
  let count = 0;

  function visit(child: ts.Node) {
    if (ts.isStatement(child) && !ts.isBlock(child)) count += 1;
    ts.forEachChild(child, visit);
  }

  ts.forEachChild(node, visit);
  return count;
}

function describePackedFunction(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): FunctionDescriptor {
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
    if (isFunctionLikeWithBody(node)) descriptors.push(describePackedFunction(node, sourceFile));
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return descriptors;
}

export { collectFunctionDescriptors, getStartLine };
export type { FunctionDescriptor };
