import ts from "typescript";

import type { SerializeContext, SerializeNodeFn } from "./context.js";
import { declareBinding, popScope, pushScope } from "./context.js";

function serializeBindingName(
  name: ts.BindingName,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown {
  if (ts.isIdentifier(name)) {
    return ["id", declareBinding(context, name.text)];
  }

  if (ts.isObjectBindingPattern(name)) {
    return [
      "object-binding",
      name.elements.map((element) => serializeBindingElement(element, context, sourceFile, serialize)),
    ];
  }

  return [
    "array-binding",
    name.elements.map((element) => (element && ts.isBindingElement(element)) ? serializeBindingElement(element, context, sourceFile, serialize) : ["hole"]),
  ];
}

function serializeBindingElement(
  element: ts.BindingElement,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown {
  return [
    "binding-element",
    element.dotDotDotToken ? "rest" : "value",
    element.propertyName ? serializePropertyName(element.propertyName, context, sourceFile, serialize) : null,
    serializeBindingName(element.name, context, sourceFile, serialize),
    element.initializer ? serialize(element.initializer, context, sourceFile) : null,
  ];
}

function serializePropertyName(
  name: ts.PropertyName,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }

  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  if (ts.isComputedPropertyName(name)) {
    return ["computed", serialize(name.expression, context, sourceFile)];
  }

  return name.getText(sourceFile);
}

function serializeFunctionLike(
  node: ts.FunctionLikeDeclaration,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown {
  const isAsync = Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword));
  const isGenerator = ts.isFunctionLike(node) && "asteriskToken" in node && Boolean(node.asteriskToken);
  pushScope(context);

  const parameters = node.parameters.map((parameter) => [
    "param",
    parameter.dotDotDotToken ? "rest" : "value",
    serializeBindingName(parameter.name, context, sourceFile, serialize),
    parameter.initializer ? serialize(parameter.initializer, context, sourceFile) : null,
  ]);

  const body = node.body
    ? serialize(node.body, context, sourceFile)
    : null;

  popScope(context);

  return [
    "function",
    isAsync,
    isGenerator,
    parameters,
    body,
  ];
}

export {
  serializeBindingElement,
  serializeBindingName,
  serializeFunctionLike,
  serializePropertyName,
};
