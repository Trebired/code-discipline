import fs from "node:fs/promises";

import ts from "typescript";

import type { NormalizedCheckCodeDisciplineOptions } from "../types.js";
import type { ScannedSourceFile } from "../../imports/types.js";
import { parseSource } from "../../imports/module-specifiers.js";
import type { CodeDisciplineViolation } from "../../shared/discipline-types.js";

type FunctionDescriptor = {
  kind: string;
  lineCount: number;
  name: string;
  startLine: number;
  endLine: number;
};

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

function resolveFunctionName(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  if ("name" in node && node.name) {
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

function describeFunction(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): FunctionDescriptor | null {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const startLine = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const endLine = sourceFile.getLineAndCharacterOfPosition(end).line + 1;
  const lineCount = Math.max(1, endLine - startLine + 1);

  return {
    kind: resolveFunctionKind(node),
    lineCount,
    name: resolveFunctionName(node, sourceFile),
    startLine,
    endLine,
  };
}

function collectFunctionDescriptors(sourceFile: ts.SourceFile): FunctionDescriptor[] {
  const descriptors: FunctionDescriptor[] = [];

  function visit(node: ts.Node) {
    if (isFunctionLikeWithBody(node)) {
      const descriptor = describeFunction(node, sourceFile);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return descriptors;
}

async function runMaxFunctionLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxFunctionLines) return [];

  const violations: CodeDisciplineViolation[] = [];

  for (const file of sourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(text, file.absolutePath);
    const functions = collectFunctionDescriptors(sourceFile);

    for (const descriptor of functions) {
      if (descriptor.lineCount <= options.rules.maxFunctionLines.max) continue;

      violations.push({
        rule: "max-function-lines",
        severity: options.rules.maxFunctionLines.severity,
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `${descriptor.kind} ${descriptor.name} has ${descriptor.lineCount} lines and exceeds the limit of ${options.rules.maxFunctionLines.max}`,
        details: {
          functionKind: descriptor.kind,
          functionName: descriptor.name,
          lineCount: descriptor.lineCount,
          max: options.rules.maxFunctionLines.max,
          startLine: descriptor.startLine,
          endLine: descriptor.endLine,
        },
      });
    }
  }

  return violations;
}

export { runMaxFunctionLinesRule };
