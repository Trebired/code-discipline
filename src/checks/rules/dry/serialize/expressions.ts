import ts from "typescript";

import { serializeFunctionLike, serializePropertyName } from "./bindings.js";
import type { SerializeContext, SerializeNodeFn } from "./context.js";
import { SAFE_GLOBAL_IDENTIFIERS, isReferenceIdentifier, lookupBinding } from "./context.js";

function serializeIdentifierExpression(
  node: ts.Node,
  context: SerializeContext,
): unknown | undefined {
  if (ts.isIdentifier(node)) {
    if (node.text === "arguments") {
      context.usesRestrictedRuntime = true;
    }

    if (!isReferenceIdentifier(node)) {
      return node.text;
    }

    const local = lookupBinding(context, node.text);
    if (local) {
      return ["local", local];
    }

    if (node.text === "arguments") {
      return ["restricted", "arguments"];
    }

    if (SAFE_GLOBAL_IDENTIFIERS.has(node.text)) {
      return ["global", node.text];
    }

    context.usesOuterScope = true;
    return ["outer", node.text];
  }

  if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword) {
    context.usesRestrictedRuntime = true;
    return ["restricted", ts.SyntaxKind[node.kind]];
  }

  if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.NewKeyword && node.name.text === "target") {
    context.usesRestrictedRuntime = true;
    return ["restricted", "new.target"];
  }

  return undefined;
}

function serializeLiteralExpression(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)) {
    return ["literal", node.text];
  }

  if (ts.isBigIntLiteral(node)) {
    return ["literal", node.text];
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) {
    return ["literal", ts.tokenToString(node.kind) ?? ts.SyntaxKind[node.kind]];
  }

  if (ts.isTemplateExpression(node)) {
    return [
      "template",
      node.head.text,
      node.templateSpans.map((span) => [
          serialize(span.expression, context, sourceFile),
          span.literal.text,
      ]),
    ];
  }

  return undefined;
}

function serializeObjectProperty(
  property: ts.ObjectLiteralElementLike,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown {
  if (ts.isPropertyAssignment(property)) {
    return ["prop", serializePropertyName(property.name, context, sourceFile, serialize), serialize(property.initializer, context, sourceFile)];
  }

  if (ts.isShorthandPropertyAssignment(property)) {
    return [
      "shorthand",
      property.name.text,
      serialize(property.name, context, sourceFile),
    ];
  }

  if (ts.isSpreadAssignment(property)) {
    return ["spread-assignment", serialize(property.expression, context, sourceFile)];
  }

  if (ts.isMethodDeclaration(property)) {
    return [
      "method",
      serializePropertyName(property.name, context, sourceFile, serialize),
      serializeFunctionLike(property, context, sourceFile, serialize)
    ];
  }

  return ["property", property.getText(sourceFile)];
}

function serializeContainerExpression(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isArrayLiteralExpression(node)) {
    return [
      "array",
      node.elements.map((element) => (
          ts.isSpreadElement(element)
          ? ["spread", serialize(element.expression, context, sourceFile)]
          : serialize(element, context, sourceFile)
      )),
    ];
  }

  if (ts.isObjectLiteralExpression(node)) {
    return [
      "object",
      node.properties.map((property) => serializeObjectProperty(property, context, sourceFile, serialize)),
    ];
  }

  return undefined;
}

function serializeAccessOrCallExpression(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return ["property-access", serialize(node.expression, context, sourceFile), node.name.text];
  }

  if (ts.isElementAccessExpression(node)) {
    return ["element-access", serialize(node.expression, context, sourceFile), serialize(node.argumentExpression, context, sourceFile)];
  }

  if (ts.isCallExpression(node)) {
    return [
      "call",
      serialize(node.expression, context, sourceFile),
      node.arguments.map((argument) => serialize(argument, context, sourceFile)),
    ];
  }

  if (ts.isNewExpression(node)) {
    return [
      "new",
      serialize(node.expression, context, sourceFile),
      (node.arguments ?? []).map((argument) => serialize(argument, context, sourceFile)),
    ];
  }

  return undefined;
}

function serializeOperatorExpression(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isAwaitExpression(node)) {
    return ["await", serialize(node.expression, context, sourceFile)];
  }

  if (ts.isYieldExpression(node)) {
    return ["yield", node.asteriskToken ? "*" : "", serialize(node.expression, context, sourceFile)];
  }

  if (ts.isConditionalExpression(node)) {
    return [
      "conditional",
      serialize(node.condition, context, sourceFile),
      serialize(node.whenTrue, context, sourceFile),
      serialize(node.whenFalse, context, sourceFile),
    ];
  }

  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
    return [
      ts.isPrefixUnaryExpression(node) ? "prefix" : "postfix",
      ts.tokenToString(node.operator) ?? String(node.operator),
      serialize(node.operand, context, sourceFile),
    ];
  }

  if (ts.isBinaryExpression(node)) {
    return [
      "binary",
      ts.tokenToString(node.operatorToken.kind) ?? String(node.operatorToken.kind),
      serialize(node.left, context, sourceFile),
      serialize(node.right, context, sourceFile),
    ];
  }

  return undefined;
}

function serializeWrapperExpression(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return serializeFunctionLike(node, context, sourceFile, serialize);
  }

  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
    return serialize(node.expression, context, sourceFile);
  }

  if (ts.isClassExpression(node) || ts.isClassDeclaration(node)) {
    return ["class", node.name?.text ?? null];
  }

  return undefined;
}

export {
  serializeAccessOrCallExpression,
  serializeContainerExpression,
  serializeIdentifierExpression,
  serializeLiteralExpression,
  serializeOperatorExpression,
  serializeWrapperExpression,
};
