import ts from "typescript";

import { SAFE_GLOBAL_IDENTIFIERS } from "../serialize/context.js";
import type { BehaviorContext, BehaviorExpression } from "./model.js";
import {
  isComparisonOperator,
  isLogicalOperator,
  isNamedGlobal,
} from "./model.js";
import { normalizeCondition, normalizeConditional } from "./conditions.js";

function normalizeExpression(
  node: ts.Node | undefined,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (!node) return undefined;

  const wrapped = normalizeWrappedExpression(node, context, sourceFile);
  if (wrapped !== undefined) return wrapped;

  const primitive = normalizePrimitiveExpression(node, context);
  if (primitive !== undefined) return primitive;

  const container = normalizeContainerExpression(node, context, sourceFile);
  if (container !== undefined) return container;

  const access = normalizeAccessExpression(node, context, sourceFile);
  if (access !== undefined) return access;

  return normalizeOperatorExpression(node, context, sourceFile);
}

function normalizeWrappedExpression(
  node: ts.Node,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)) {
    return normalizeExpression(node.expression, context, sourceFile);
  }

  return undefined;
}

function normalizePrimitiveExpression(node: ts.Node, context: BehaviorContext): BehaviorExpression | undefined {
  if (ts.isIdentifier(node)) return normalizeIdentifier(node, context);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return ["literal", "boolean", true];
  if (node.kind === ts.SyntaxKind.FalseKeyword) return ["literal", "boolean", false];
  if (node.kind === ts.SyntaxKind.NullKeyword) return ["literal", "null"];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return ["literal", "string", node.text];
  if (ts.isNumericLiteral(node)) return ["literal", "number", node.text];
  if (ts.isBigIntLiteral(node)) return ["literal", "bigint", node.text];
  return undefined;
}

function normalizeIdentifier(node: ts.Identifier, context: BehaviorContext): BehaviorExpression {
  const parameter = context.parameters.get(node.text);
  if (parameter) return ["param", parameter];

  const local = context.locals.get(node.text);
  if (local !== undefined) return local;

  if (node.text === "undefined") return ["literal", "undefined"];
  if (SAFE_GLOBAL_IDENTIFIERS.has(node.text)) return ["global", node.text];

  return ["outer", node.text];
}

function normalizeContainerExpression(
  node: ts.Node,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (ts.isArrayLiteralExpression(node)) return normalizeArrayLiteral(node, context, sourceFile);
  if (ts.isObjectLiteralExpression(node)) return normalizeObjectLiteral(node, context, sourceFile);
  if (ts.isTemplateExpression(node)) return normalizeTemplateExpression(node, context, sourceFile);
  return undefined;
}

function normalizeArrayLiteral(
  node: ts.ArrayLiteralExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const elements = node.elements.map((element) => (
    ts.isSpreadElement(element)
      ? ["spread", normalizeExpression(element.expression, context, sourceFile)]
      : normalizeExpression(element, context, sourceFile)
  ));
  return elements.some((element) => element === undefined || (Array.isArray(element) && element[1] === undefined))
    ? undefined
    : ["array", elements];
}

function normalizeObjectLiteral(
  node: ts.ObjectLiteralExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const properties: BehaviorExpression[] = [];

  for (const property of node.properties) {
    const normalized = normalizeObjectProperty(property, context, sourceFile);
    if (normalized === undefined) return undefined;
    properties.push(normalized);
  }

  return ["object", properties];
}

function normalizeObjectProperty(
  property: ts.ObjectLiteralElementLike,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (ts.isPropertyAssignment(property)) {
    const value = normalizeExpression(property.initializer, context, sourceFile);
    return value === undefined ? undefined : ["property", property.name.getText(sourceFile), value];
  }

  if (ts.isShorthandPropertyAssignment(property)) {
    return ["property", property.name.text, normalizeIdentifier(property.name, context)];
  }

  if (ts.isSpreadAssignment(property)) {
    const value = normalizeExpression(property.expression, context, sourceFile);
    return value === undefined ? undefined : ["spread", value];
  }

  return undefined;
}

function normalizeTemplateExpression(
  node: ts.TemplateExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const spans = node.templateSpans.map((span) => [
    normalizeExpression(span.expression, context, sourceFile),
    span.literal.text,
  ]);
  return spans.some(([expression]) => expression === undefined) ? undefined : ["template", node.head.text, spans];
}

function normalizeAccessExpression(
  node: ts.Node,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    const target = normalizeExpression(node.expression, context, sourceFile);
    return target === undefined ? undefined : ["member", target, node.name.text];
  }

  if (ts.isElementAccessExpression(node)) {
    const target = normalizeExpression(node.expression, context, sourceFile);
    const argument = normalizeExpression(node.argumentExpression, context, sourceFile);
    return target === undefined || argument === undefined ? undefined : ["element", target, argument];
  }

  return undefined;
}

function normalizeOperatorExpression(
  node: ts.Node,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (ts.isCallExpression(node)) return normalizeCallExpression(node, context, sourceFile);
  if (ts.isConditionalExpression(node)) return normalizeConditionalExpression(node, context, sourceFile);
  if (ts.isPrefixUnaryExpression(node)) return normalizePrefixUnaryExpression(node, context, sourceFile);
  if (ts.isBinaryExpression(node)) return normalizeBinaryExpression(node, context, sourceFile);
  if (ts.isTypeOfExpression(node)) return normalizeTypeOfExpression(node, context, sourceFile);
  return undefined;
}

function normalizeCallExpression(
  node: ts.CallExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const callee = normalizeExpression(node.expression, context, sourceFile);
  const args = node.arguments.map((argument) => normalizeExpression(argument, context, sourceFile));
  if (callee === undefined || args.some((arg) => arg === undefined)) return undefined;

  if (isNamedGlobal(callee, "Boolean") && args.length === 1) {
    return ["truthy", args[0]!];
  }

  return ["call", callee, args];
}

function normalizeConditionalExpression(
  node: ts.ConditionalExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const condition = normalizeCondition(node.condition, context, sourceFile);
  const whenTrue = normalizeExpression(node.whenTrue, context, sourceFile);
  const whenFalse = normalizeExpression(node.whenFalse, context, sourceFile);
  return condition === undefined || whenTrue === undefined || whenFalse === undefined
    ? undefined
    : normalizeConditional(condition, whenTrue, whenFalse);
}

function normalizePrefixUnaryExpression(
  node: ts.PrefixUnaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (node.operator === ts.SyntaxKind.ExclamationToken) return normalizeCondition(node, context, sourceFile);

  const operand = normalizeExpression(node.operand, context, sourceFile);
  return operand === undefined ? undefined : ["prefix", ts.tokenToString(node.operator) ?? String(node.operator), operand];
}

function normalizeBinaryExpression(
  node: ts.BinaryExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (isComparisonOperator(node.operatorToken.kind)) {
    return normalizeCondition(node, context, sourceFile);
  }

  const left = normalizeExpression(node.left, context, sourceFile);
  const right = normalizeExpression(node.right, context, sourceFile);
  if (left === undefined || right === undefined) return undefined;

  if (isLogicalOperator(node.operatorToken.kind)) {
    return ["logical", ts.tokenToString(node.operatorToken.kind) ?? String(node.operatorToken.kind), left, right];
  }

  return node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ? ["coalesce", left, right]
    : ["binary", ts.tokenToString(node.operatorToken.kind) ?? String(node.operatorToken.kind), left, right];
}

function normalizeTypeOfExpression(
  node: ts.TypeOfExpression,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const expression = normalizeExpression(node.expression, context, sourceFile);
  return expression === undefined ? undefined : ["typeof", expression];
}

export { normalizeExpression };
