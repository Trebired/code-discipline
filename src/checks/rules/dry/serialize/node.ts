import ts from "typescript";

import type { SerializeContext } from "./context.js";
import {
  serializeAccessOrCallExpression,
  serializeContainerExpression,
  serializeIdentifierExpression,
  serializeLiteralExpression,
  serializeOperatorExpression,
  serializeWrapperExpression,
} from "./expressions.js";
import {
  serializeBranchStatement,
  serializeControlStatement,
  serializeScopeStatement,
} from "./statements.js";

const NODE_SERIALIZERS = [
  serializeScopeStatement,
  serializeControlStatement,
  serializeBranchStatement,
  serializeLiteralExpression,
  serializeContainerExpression,
  serializeAccessOrCallExpression,
  serializeOperatorExpression,
  serializeWrapperExpression,
];

function isTypeOnlyNode(node: ts.Node): boolean {
  return ts.isTypeNode(node)
  ||ts.isTypeParameterDeclaration(node)
  ||ts.isTypeAliasDeclaration(node)
  ||ts.isInterfaceDeclaration(node)
  ||ts.isImportTypeNode(node);
}

function serializeNode(
  node: ts.Node | undefined,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
): unknown {
  if (!node) return null;
  if (isTypeOnlyNode(node)) return null;

  if (ts.isParenthesizedExpression(node)) {
    return serializeNode(node.expression, context, sourceFile);
  }

  const identifier = serializeIdentifierExpression(node, context);
  if (identifier !== undefined) return identifier;

  for (const serializer of NODE_SERIALIZERS) {
    const result = serializer(node, context, sourceFile, serializeNode);
    if (result !== undefined) return result;
  }

  return [
    ts.SyntaxKind[node.kind],
    node.getChildren(sourceFile).map((child) => serializeNode(child, context, sourceFile)),
  ];
}

export { serializeNode };
