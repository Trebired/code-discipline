import ts from "typescript";

import { stableSerialize } from "#ntve5i5a0mol";

type BehaviorExpression = unknown;

type BehaviorContext = {
  locals: Map<string, BehaviorExpression>;
  parameters: Map<string, string>;
};

type BehaviorFingerprint = {
  fingerprint: string;
  normalized: BehaviorExpression;
};

const COMMUTATIVE_COMPARISON_OPERATORS = new Set(["==", "==="]);

function cloneContext(context: BehaviorContext): BehaviorContext {
  return {
    locals: new Map(context.locals),
    parameters: context.parameters,
  };
}

function isTagged(value: BehaviorExpression, tag: string): value is [string, ...BehaviorExpression[]] {
  return Array.isArray(value) && value[0] === tag;
}

function isNamedGlobal(value: BehaviorExpression, name: string): boolean {
  return Array.isArray(value) && value[0] === "global" && value[1] === name;
}

function isBooleanExpression(value: BehaviorExpression): boolean {
  return Array.isArray(value)
    && ["and", "call", "compare", "not", "nullish", "truthy"].includes(String(value[0]));
}

function expressionsEqual(left: BehaviorExpression, right: BehaviorExpression): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function replaceExpression(
  expression: BehaviorExpression,
  target: BehaviorExpression,
  replacement: BehaviorExpression,
): BehaviorExpression {
  if (expressionsEqual(expression, target)) return replacement;
  if (!Array.isArray(expression)) return expression;
  return expression.map((part) => (
    Array.isArray(part)
      ? replaceExpression(part, target, replacement)
      : part
  ));
}

function inferReplacement(
  template: BehaviorExpression,
  concrete: BehaviorExpression,
  placeholder: BehaviorExpression,
): { found: boolean; replacement?: BehaviorExpression } | null {
  if (expressionsEqual(template, placeholder)) {
    return { found: true, replacement: concrete };
  }

  if (!Array.isArray(template) || !Array.isArray(concrete) || template.length !== concrete.length) {
    return expressionsEqual(template, concrete) ? { found: false } : null;
  }

  let found = false;
  let replacement: BehaviorExpression | undefined;

  for (let index = 0; index < template.length; index += 1) {
    const next = inferReplacement(template[index], concrete[index], placeholder);
    if (!next) return null;
    if (!next.found) continue;

    if (replacement !== undefined && !expressionsEqual(replacement, next.replacement)) return null;
    found = true;
    replacement = next.replacement;
  }

  return { found, replacement };
}

function inferSingleReplacement(
  template: BehaviorExpression,
  concrete: BehaviorExpression,
  placeholder: BehaviorExpression,
): BehaviorExpression | undefined {
  const result = inferReplacement(template, concrete, placeholder);
  return result?.found ? result.replacement : undefined;
}

function normalizeAnd(terms: BehaviorExpression[]): BehaviorExpression {
  const flattened = terms.flatMap((term) => isTagged(term, "and") ? term.slice(1) : [term]);
  const unique = new Map<string, BehaviorExpression>();
  for (const term of flattened) unique.set(stableSerialize(term), term);

  const sorted = [...unique.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, term]) => term);
  return sorted.length === 1 ? sorted[0]! : ["and", ...sorted];
}

function invertCondition(expression: BehaviorExpression): BehaviorExpression {
  if (isTagged(expression, "not")) return expression[1];
  return ["not", expression];
}

function flattenBinary(node: ts.BinaryExpression, operator: ts.SyntaxKind): ts.Node[] {
  const left = ts.isBinaryExpression(node.left) && node.left.operatorToken.kind === operator
    ? flattenBinary(node.left, operator)
    : [node.left];
  const right = ts.isBinaryExpression(node.right) && node.right.operatorToken.kind === operator
    ? flattenBinary(node.right, operator)
    : [node.right];
  return [...left, ...right];
}

function isComparisonOperator(kind: ts.SyntaxKind): boolean {
  return isEqualityOperator(kind)
    || kind === ts.SyntaxKind.LessThanToken
    || kind === ts.SyntaxKind.LessThanEqualsToken
    || kind === ts.SyntaxKind.GreaterThanToken
    || kind === ts.SyntaxKind.GreaterThanEqualsToken
    || kind === ts.SyntaxKind.InstanceOfKeyword
    || kind === ts.SyntaxKind.InKeyword;
}

function isEqualityOperator(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.EqualsEqualsToken
    || kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    || kind === ts.SyntaxKind.ExclamationEqualsToken
    || kind === ts.SyntaxKind.ExclamationEqualsEqualsToken;
}

function isLogicalOperator(kind: ts.SyntaxKind): boolean {
  return kind === ts.SyntaxKind.AmpersandAmpersandToken
    || kind === ts.SyntaxKind.BarBarToken;
}

function positiveEqualityOperator(kind: ts.SyntaxKind): "==" | "===" {
  return kind === ts.SyntaxKind.EqualsEqualsEqualsToken || kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    ? "==="
    : "==";
}

function normalizeComparison(operator: string, left: BehaviorExpression, right: BehaviorExpression): BehaviorExpression {
  if (!COMMUTATIVE_COMPARISON_OPERATORS.has(operator)) return ["compare", operator, left, right];

  const sorted = [left, right].sort((leftValue, rightValue) => stableSerialize(leftValue).localeCompare(stableSerialize(rightValue)));
  return ["compare", operator, sorted[0]!, sorted[1]!];
}

function reduceExpression(expression: BehaviorExpression): BehaviorExpression {
  if (!Array.isArray(expression)) return expression;

  const [tag] = expression;
  if (tag === "call") return reduceCallExpression(expression);
  if (tag === "member") return ["member", reduceExpression(expression[1]), expression[2]];
  if (tag === "coalesce") return reduceCoalesceExpression(expression);
  if (tag === "conditional") {
    return [
      "conditional",
      reduceExpression(expression[1]),
      reduceExpression(expression[2]),
      reduceExpression(expression[3]),
    ];
  }
  if (tag === "and") return normalizeAnd(expression.slice(1).map(reduceExpression));
  if (tag === "not") return invertCondition(reduceExpression(expression[1]));

  return expression.map((part) => (
    Array.isArray(part)
      ? reduceExpression(part)
      : part
  ));
}

function reduceCallExpression(expression: BehaviorExpression[]): BehaviorExpression {
  const callee = reduceExpression(expression[1]);
  const args = Array.isArray(expression[2])
    ? expression[2].map(reduceExpression)
    : [];

  if (isNamedGlobal(callee, "String") && args.length === 1 && isStringLiteral(args[0])) {
    return args[0]!;
  }

  if (Array.isArray(callee) && callee[0] === "member" && args.length === 0) {
    const target = reduceExpression(callee[1]);
    const method = callee[2];

    if (isStringLiteral(target)) {
      const text = String(target[2]);
      if (method === "trim") return ["literal", "string", text.trim()];
      if (method === "toLowerCase") return ["literal", "string", text.toLowerCase()];
      if (method === "toUpperCase") return ["literal", "string", text.toUpperCase()];
    }

    return ["call", ["member", target, method], args];
  }

  return ["call", callee, args];
}

function reduceCoalesceExpression(expression: BehaviorExpression[]): BehaviorExpression {
  const left = reduceExpression(expression[1]);
  const right = reduceExpression(expression[2]);

  if (isNullishLiteral(left)) return right;
  if (isDefiniteLiteral(left)) return left;
  return ["coalesce", left, right];
}

function isStringLiteral(expression: BehaviorExpression): boolean {
  return Array.isArray(expression) && expression[0] === "literal" && expression[1] === "string";
}

function isNullishLiteral(expression: BehaviorExpression): boolean {
  return Array.isArray(expression)
    && expression[0] === "literal"
    && (expression[1] === "null" || expression[1] === "undefined");
}

function isDefiniteLiteral(expression: BehaviorExpression): boolean {
  return Array.isArray(expression)
    && expression[0] === "literal"
    && !["null", "undefined"].includes(String(expression[1]));
}

export {
  cloneContext,
  expressionsEqual,
  flattenBinary,
  inferSingleReplacement,
  invertCondition,
  isBooleanExpression,
  isComparisonOperator,
  isEqualityOperator,
  isLogicalOperator,
  isNamedGlobal,
  isTagged,
  normalizeAnd,
  normalizeComparison,
  positiveEqualityOperator,
  reduceExpression,
  replaceExpression,
};
export type { BehaviorContext, BehaviorExpression, BehaviorFingerprint };
