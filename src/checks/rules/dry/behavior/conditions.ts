import ts from "typescript";

import type { BehaviorContext, BehaviorExpression } from "./model.js";
import {
  expressionsEqual,
  flattenBinary,
  inferSingleReplacement,
  invertCondition,
  isBooleanExpression,
  isComparisonOperator,
  isEqualityOperator,
  isTagged,
  normalizeAnd,
  normalizeComparison,
  positiveEqualityOperator,
  reduceExpression,
  replaceExpression,
} from "./model.js";
import { normalizeExpression } from "./expressions.js";

function normalizeCondition(
  node: ts.Node,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const unwrapped = unwrapCondition(node);
  if (unwrapped !== node) return normalizeCondition(unwrapped, context, sourceFile);

  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = normalizeCondition(node.operand, context, sourceFile);
    return operand === undefined ? undefined : invertCondition(operand);
  }

  const nullishGroup = normalizeNullishGroup(node, context, sourceFile);
  if (nullishGroup !== undefined) return nullishGroup;

  if (ts.isBinaryExpression(node)) {
    return normalizeBinaryCondition(node, context, sourceFile);
  }

  const expression = normalizeExpression(node, context, sourceFile);
  return expression === undefined || isBooleanExpression(expression) ? expression : ["truthy", expression];
}

function unwrapCondition(node: ts.Node): ts.Node {
  if (ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)) {
    return node.expression;
  }

  return node;
}

function normalizeBinaryCondition(
  node: ts.BinaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return normalizeLogicalAnd(node, context, sourceFile);
  }

  if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    return normalizeLogicalOr(node, context, sourceFile);
  }

  if (isEqualityOperator(node.operatorToken.kind)) {
    return normalizeEqualityCondition(node, context, sourceFile);
  }

  if (isComparisonOperator(node.operatorToken.kind)) {
    const left = normalizeExpression(node.left, context, sourceFile);
    const right = normalizeExpression(node.right, context, sourceFile);
    return left === undefined || right === undefined
      ? undefined
      : ["compare", ts.tokenToString(node.operatorToken.kind) ?? String(node.operatorToken.kind), left, right];
  }

  return undefined;
}

function normalizeLogicalAnd(
  node: ts.BinaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const terms = flattenBinary(node, ts.SyntaxKind.AmpersandAmpersandToken)
    .map((term) => normalizeCondition(term, context, sourceFile));
  return terms.some((term) => term === undefined) ? undefined : normalizeAnd(terms as BehaviorExpression[]);
}

function normalizeLogicalOr(
  node: ts.BinaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const terms = flattenBinary(node, ts.SyntaxKind.BarBarToken)
    .map((term) => normalizeCondition(term, context, sourceFile));
  if (terms.some((term) => term === undefined)) return undefined;
  return invertCondition(normalizeAnd((terms as BehaviorExpression[]).map(invertCondition)));
}

function normalizeConditional(
  condition: BehaviorExpression,
  whenTrue: BehaviorExpression,
  whenFalse: BehaviorExpression,
): BehaviorExpression {
  if (isTagged(condition, "not")) {
    return normalizeConditional(condition[1], whenFalse, whenTrue);
  }

  const coalesce = normalizeCoalesceConditional(condition, whenTrue, whenFalse);
  if (coalesce) return coalesce;

  return reduceExpression(["conditional", condition, whenTrue, whenFalse]);
}

function normalizeCoalesceConditional(
  condition: BehaviorExpression,
  whenTrue: BehaviorExpression,
  whenFalse: BehaviorExpression,
): BehaviorExpression | undefined {
  if (!isTagged(condition, "nullish")) return undefined;

  const checked = condition[1];
  const fallback = inferCoalesceFallback(checked, whenTrue, whenFalse);
  if (fallback !== undefined) return reduceExpression(replaceExpression(whenFalse, checked, ["coalesce", checked, fallback]));

  return undefined;
}

function inferCoalesceFallback(
  checked: BehaviorExpression,
  whenNullish: BehaviorExpression,
  whenPresent: BehaviorExpression,
): BehaviorExpression | undefined {
  if (expressionsEqual(checked, whenPresent)) return whenNullish;

  const structural = inferSingleReplacement(whenPresent, whenNullish, checked);
  if (structural !== undefined) return structural;

  const foldedNullishResult = reduceExpression(replaceExpression(whenPresent, checked, whenNullish));
  return expressionsEqual(foldedNullishResult, whenNullish) ? whenNullish : undefined;
}

function normalizeEqualityCondition(
  node: ts.BinaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const nullish = normalizeNullishGroup(node, context, sourceFile);
  if (nullish !== undefined) return nullish;

  const left = normalizeExpression(node.left, context, sourceFile);
  const right = normalizeExpression(node.right, context, sourceFile);
  if (left === undefined || right === undefined) return undefined;

  const equality = normalizeComparison(positiveEqualityOperator(node.operatorToken.kind), left, right);
  return node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
    || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
    ? invertCondition(equality)
    : equality;
}

function normalizeNullishGroup(
  node: ts.Node,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (!ts.isBinaryExpression(node)) return undefined;

  if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken) {
    const equality = normalizeNullishEquality(node, context, sourceFile);
    if (!equality) return undefined;
    return node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ? invertCondition(equality) : equality;
  }

  if (node.operatorToken.kind !== ts.SyntaxKind.BarBarToken && node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
    return undefined;
  }

  return normalizeStrictNullishGroup(node, context, sourceFile);
}

function normalizeStrictNullishGroup(
  node: ts.BinaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const parts = flattenBinary(node, node.operatorToken.kind)
    .map((part) => normalizeStrictNullishEquality(part, context, sourceFile));
  if (parts.some((part) => part === undefined)) return undefined;

  const first = parts[0]!;
  const sameExpression = parts.every((part) => expressionsEqual(part!.expression, first.expression));
  const hasNull = parts.some((part) => part!.kind === "null");
  const hasUndefined = parts.some((part) => part!.kind === "undefined");
  if (!sameExpression || !hasNull || !hasUndefined) return undefined;

  const isNullish = node.operatorToken.kind === ts.SyntaxKind.BarBarToken && parts.every((part) => !part!.negated);
  const isNotNullish = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && parts.every((part) => part!.negated);
  if (!isNullish && !isNotNullish) return undefined;

  const nullish = ["nullish", first.expression];
  return isNotNullish ? invertCondition(nullish) : nullish;
}

function normalizeNullishEquality(
  node: ts.BinaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const leftNull = isNullLiteral(node.left);
  const rightNull = isNullLiteral(node.right);
  if (!leftNull && !rightNull) return undefined;

  const expression = normalizeExpression(leftNull ? node.right : node.left, context, sourceFile);
  return expression === undefined ? undefined : ["nullish", expression];
}

function normalizeStrictNullishEquality(
  node: ts.Node,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): { expression: BehaviorExpression; kind: "null" | "undefined"; negated: boolean } | undefined {
  if (!ts.isBinaryExpression(node) || !isEqualityOperator(node.operatorToken.kind)) return undefined;

  const leftKind = nullishLiteralKind(node.left);
  const rightKind = nullishLiteralKind(node.right);
  if (!leftKind && !rightKind) return undefined;

  const expression = normalizeExpression(leftKind ? node.right : node.left, context, sourceFile);
  if (expression === undefined) return undefined;

  return {
    expression,
    kind: leftKind ?? rightKind!,
    negated: node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
      || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken,
  };
}

function isNullLiteral(node: ts.Node): boolean {
  return node.kind === ts.SyntaxKind.NullKeyword;
}

function nullishLiteralKind(node: ts.Node): "null" | "undefined" | undefined {
  if (node.kind === ts.SyntaxKind.NullKeyword) return "null";
  if (ts.isIdentifier(node) && node.text === "undefined") return "undefined";
  return undefined;
}

export { normalizeCondition, normalizeConditional };
