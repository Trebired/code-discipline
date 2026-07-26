import ts from "typescript";

import { stableSerialize } from "#ntve5i5a0mol";
import { createBehaviorFingerprint } from "./behavior/index.js";
import { serializeFunctionLike } from "./serialize/bindings.js";
import { createSerializeContext } from "./serialize/context.js";
import { serializeNode } from "./serialize/node.js";

function createFunctionFingerprint(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
): {
  fingerprint: string;
  behaviorFingerprint?: string;
  normalized: unknown;
  normalizedBehavior?: unknown;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
} {
  const context = createSerializeContext();
  const normalized = serializeFunctionLike(node, context, sourceFile, serializeNode);
  const behavior = createBehaviorFingerprint(node, sourceFile);

  return {
    behaviorFingerprint: behavior?.fingerprint,
    fingerprint: stableSerialize(normalized),
    normalized,
    normalizedBehavior: behavior?.normalized,
    usesOuterScope: context.usesOuterScope,
    usesRestrictedRuntime: context.usesRestrictedRuntime,
  };
}

function resolveStandaloneName(node: ts.FunctionLikeDeclaration): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) {
    return node.name.text;
  }

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }

  return undefined;
}

function resolveFunctionDisplayName(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string | undefined {
  const standaloneName = resolveStandaloneName(node);
  if (standaloneName) return standaloneName;

  if ((ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name) {
    return node.name.getText(sourceFile);
  }

  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }

  return undefined;
}

function resolveClassification(node: ts.FunctionLikeDeclaration): "method" | "standalone" | "unsupported" {
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node)) {
    return "method";
  }

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return "standalone";
  }

  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return resolveStandaloneName(node) ? "standalone" : "unsupported";
  }

  return "unsupported";
}

function resolveRemovalRange(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): { start: number; end: number; ok: boolean } {
  if (ts.isFunctionDeclaration(node) && node.parent) {
    return {
      start: node.getFullStart(),
      end: expandRemovalEnd(sourceFile.text, node.getEnd()),
      ok: true,
    };
  }

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent)) {
    const declarationList = parent.parent;
    const statement = declarationList?.parent;
    const isSingleDeclaration = ts.isVariableDeclarationList(declarationList)
      && declarationList.declarations.length === 1
      && ts.isVariableStatement(statement);

    if (!isSingleDeclaration) {
      return {
        start: parent.getStart(sourceFile),
        end: parent.getEnd(),
        ok: false,
      };
    }

    return {
      start: statement.getFullStart(),
      end: expandRemovalEnd(sourceFile.text, statement.getEnd()),
      ok: true,
    };
  }

  return {
    start: node.getStart(sourceFile),
    end: node.getEnd(),
    ok: false,
  };
}

function expandRemovalEnd(text: string, end: number): number {
  if (text.slice(end, end + 2) === "\r\n") return end + 2;
  if (text[end] === "\n") return end + 1;
  return end;
}

export {
  createFunctionFingerprint,
  resolveClassification,
  resolveFunctionDisplayName,
  resolveRemovalRange,
  resolveStandaloneName,
};
