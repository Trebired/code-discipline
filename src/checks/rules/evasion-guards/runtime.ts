import ts from "typescript";

import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { getStartLine } from "./functions.js";

function isStringLike(node: ts.Node | undefined): node is ts.StringLiteralLike {
  return Boolean(node && ts.isStringLiteralLike(node));
}

function getExpressionName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return null;
}

function createRuntimeCodeHidingViolation(
  file: ScannedSourceFile,
  sourceFile: ts.SourceFile,
  kind: string,
  node: ts.Node,
): CodeDisciplineViolation {
  return {
    rule: "evasion-guards",
    fix: false,
    filePath: file.relativeFromProjectRoot,
    message: `runtime code hiding detected via ${kind}`,
    details: {
      kind: "runtime-code-hiding",
      pattern: kind,
      line: getStartLine(sourceFile, node),
    },
  };
}

function collectRuntimeCodeHidingViolations(
  file: ScannedSourceFile,
  sourceFile: ts.SourceFile,
): CodeDisciplineViolation[] {
  const violations: CodeDisciplineViolation[] = [];

  function add(kind: string, node: ts.Node) {
    violations.push(createRuntimeCodeHidingViolation(file, sourceFile, kind, node));
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const name = getExpressionName(node.expression);
      const [firstArg] = node.arguments;
      if (name === "eval" && isStringLike(firstArg)) add("eval", node);
      if (name === "Function" && isStringLike(firstArg)) add("Function", node);
      if ((name === "setTimeout" || name === "setInterval") && isStringLike(firstArg)) add(name, node);
    }

    if (ts.isNewExpression(node) && getExpressionName(node.expression) === "Function" && isStringLike(node.arguments?.[0])) {
      add("new Function", node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export { collectRuntimeCodeHidingViolations };
