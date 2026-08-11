import ts from "typescript";

import { stableSerialize } from "#ntve5i5a0mol";
import type { BehaviorContext, BehaviorFingerprint } from "./model.js";
import { normalizeExpression } from "./expressions.js";
import { normalizeFunctionReturn } from "./statements.js";

function createBehaviorFingerprint(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): BehaviorFingerprint | null {
  const parameterNames = node.parameters.map((parameter) => ts.isIdentifier(parameter.name) ? parameter.name.text : null);
  if (parameterNames.some((name) => name === null)) return null;
  if (node.parameters.some((parameter) => parameter.dotDotDotToken)) return null;

  const context: BehaviorContext = {
    locals: new Map(),
    parameters: new Map(parameterNames.map((name, index) => [name!, `p${index}`])),
  };
  const parameterDefaults = node.parameters.map((parameter) => (
      parameter.initializer ? normalizeExpression(parameter.initializer, context, sourceFile) : null
  ));
  if (parameterDefaults.some((value) => value === undefined)) return null;

  const returned = normalizeFunctionReturn(node, context, sourceFile);
  if (returned === undefined) return null;

  const normalized = [
    "behavior-function",
    parameterDefaults,
    returned,
  ];

  return {
    fingerprint: stableSerialize(normalized),
    normalized,
  };
}

export { createBehaviorFingerprint };
export type { BehaviorFingerprint };
