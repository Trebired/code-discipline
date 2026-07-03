import ts from "typescript";

import { serializeBindingName } from "./bindings.js";
import type { SerializeContext, SerializeNodeFn } from "./context.js";
import { popScope, pushScope } from "./context.js";

function serializeScopeStatement(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isBlock(node)) {
    pushScope(context);
    const result = ["block", node.statements.map((statement) => serialize(statement, context, sourceFile))];
    popScope(context);
    return result;
  }

  if (ts.isReturnStatement(node)) {
    return ["return", serialize(node.expression, context, sourceFile)];
  }

  if (ts.isExpressionStatement(node)) {
    return ["expr", serialize(node.expression, context, sourceFile)];
  }

  if (ts.isVariableStatement(node)) {
    return ["vars", node.declarationList.flags, node.declarationList.declarations.map((declaration) => serialize(declaration, context, sourceFile))];
  }

  if (ts.isVariableDeclaration(node)) {
    return [
      "var",
      serializeBindingName(node.name, context, sourceFile, serialize),
      serialize(node.initializer, context, sourceFile),
    ];
  }

  return undefined;
}

function serializeControlStatement(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isIfStatement(node)) {
    return [
      "if",
      serialize(node.expression, context, sourceFile),
      serialize(node.thenStatement, context, sourceFile),
      serialize(node.elseStatement, context, sourceFile),
    ];
  }

  if (ts.isForStatement(node)) {
    return [
      "for",
      serialize(node.initializer, context, sourceFile),
      serialize(node.condition, context, sourceFile),
      serialize(node.incrementor, context, sourceFile),
      serialize(node.statement, context, sourceFile),
    ];
  }

  if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    return [
      ts.isForOfStatement(node) ? "for-of" : "for-in",
      serialize(node.initializer, context, sourceFile),
      serialize(node.expression, context, sourceFile),
      serialize(node.statement, context, sourceFile),
    ];
  }

  if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
    return [
      ts.isWhileStatement(node) ? "while" : "do",
      serialize(node.expression, context, sourceFile),
      serialize(node.statement, context, sourceFile),
    ];
  }

  if (ts.isThrowStatement(node)) {
    return ["throw", serialize(node.expression, context, sourceFile)];
  }

  return undefined;
}

function serializeTryStatement(
  node: ts.TryStatement,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown {
  return [
    "try",
    serialize(node.tryBlock, context, sourceFile),
    node.catchClause
      ? [
        "catch",
        node.catchClause.variableDeclaration
          ? serializeBindingName(node.catchClause.variableDeclaration.name, context, sourceFile, serialize)
          : null,
        serialize(node.catchClause.block, context, sourceFile),
      ]
      : null,
    serialize(node.finallyBlock, context, sourceFile),
  ];
}

function serializeBranchStatement(
  node: ts.Node,
  context: SerializeContext,
  sourceFile: ts.SourceFile,
  serialize: SerializeNodeFn,
): unknown | undefined {
  if (ts.isTryStatement(node)) {
    return serializeTryStatement(node, context, sourceFile, serialize);
  }

  if (ts.isSwitchStatement(node)) {
    return [
      "switch",
      serialize(node.expression, context, sourceFile),
      node.caseBlock.clauses.map((clause) => (
        ts.isCaseClause(clause)
          ? ["case", serialize(clause.expression, context, sourceFile), clause.statements.map((statement) => serialize(statement, context, sourceFile))]
          : ["default", clause.statements.map((statement) => serialize(statement, context, sourceFile))]
      )),
    ];
  }

  return undefined;
}

export { serializeBranchStatement, serializeControlStatement, serializeScopeStatement };
