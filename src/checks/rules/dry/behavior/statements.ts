import ts from "typescript";

import type { BehaviorContext, BehaviorExpression } from "./model.js";
import { cloneContext } from "./model.js";
import { normalizeCondition, normalizeConditional } from "./conditions.js";
import { normalizeExpression } from "./expressions.js";

function normalizeFunctionReturn(
  node: ts.FunctionLikeDeclaration,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (!node.body) return undefined;

  if (ts.isBlock(node.body)) {
    return normalizeStatementSequence([...node.body.statements], cloneContext(context), sourceFile);
  }

  return normalizeExpression(node.body, context, sourceFile);
}

function normalizeStatementSequence(
  statements: ts.Statement[],
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const next = recordLeadingConstStatements(statements, context, sourceFile);
  if (next === undefined) return undefined;

  const remaining = statements.slice(next);
  if (remaining.length === 1) {
    return normalizeTerminalReturn(remaining[0]!, context, sourceFile);
  }

  if (remaining.length === 2 && ts.isIfStatement(remaining[0]!)) {
    const fallback = normalizeTerminalReturn(remaining[1]!, cloneContext(context), sourceFile);
    if (fallback === undefined) return undefined;
    return normalizeIfReturn(remaining[0] as ts.IfStatement, fallback, context, sourceFile);
  }

  return undefined;
}

function recordLeadingConstStatements(
  statements: ts.Statement[],
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): number | undefined {
  let index = 0;

  while (index < statements.length && ts.isVariableStatement(statements[index]!)) {
    if (!recordConstStatement(statements[index] as ts.VariableStatement, context, sourceFile)) return undefined;
    index += 1;
  }

  return index;
}

function recordConstStatement(statement: ts.VariableStatement, context: BehaviorContext, sourceFile: ts.SourceFile): boolean {
  if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return false;

  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return false;

    const value = normalizeExpression(declaration.initializer, context, sourceFile);
    if (value === undefined) return false;
    context.locals.set(declaration.name.text, value);
  }

  return true;
}

function normalizeTerminalReturn(
  statement: ts.Statement,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  if (ts.isReturnStatement(statement) && statement.expression) {
    return normalizeExpression(statement.expression, context, sourceFile);
  }

  if (ts.isBlock(statement)) {
    return normalizeStatementSequence([...statement.statements], cloneContext(context), sourceFile);
  }

  if (ts.isIfStatement(statement) && statement.elseStatement) {
    return normalizeIfReturn(statement, undefined, context, sourceFile);
  }

  return undefined;
}

function normalizeIfReturn(
  statement: ts.IfStatement,
  fallthrough: BehaviorExpression | undefined,
  context: BehaviorContext,
  sourceFile: ts.SourceFile,
): BehaviorExpression | undefined {
  const condition = normalizeCondition(statement.expression, context, sourceFile);
  const whenTrue = normalizeTerminalReturn(statement.thenStatement, cloneContext(context), sourceFile);
  const whenFalse = statement.elseStatement
    ? normalizeTerminalReturn(statement.elseStatement, cloneContext(context), sourceFile)
    : fallthrough;

  if (condition === undefined || whenTrue === undefined || whenFalse === undefined) return undefined;
  return normalizeConditional(condition, whenTrue, whenFalse);
}

export { normalizeFunctionReturn, normalizeStatementSequence };
