import ts from "typescript";

import { getLine, resolveAttachedStartLine } from "./comments.js";
import type { StructuralGroup, StructuralUnit } from "./types.js";

function resolveDeclarationName(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  ) {
    return node.name?.getText();
  }

  return undefined;
}

function classifyStatement(node: ts.Statement, isDirectiveCandidate: boolean): StructuralGroup {
  if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return "import";
  if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) return "export";
  if (isDirectiveCandidate) return "directive";
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return "type";
  if (ts.isVariableStatement(node)) return "variable";
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isModuleDeclaration(node)) return "namespace";
  return "execution";
}

function classifyMember(node: ts.ClassElement): StructuralGroup | undefined {
  if (ts.isPropertyDeclaration(node) || ts.isIndexSignatureDeclaration(node)) return "class-field";
  if (ts.isConstructorDeclaration(node)) return "class-constructor";
  if (ts.isMethodDeclaration(node)) return "class-method";
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return "class-accessor";
  if (ts.isClassStaticBlockDeclaration(node)) return "class-static-block";
  return undefined;
}

function buildStatementUnits(
  sourceFile: ts.SourceFile,
  fullText: string,
  statements: readonly ts.Statement[],
  notBeforePos: number,
): StructuralUnit[] {
  const units: StructuralUnit[] = [];
  let inDirectivePrologue = true;

  statements.forEach((node, index) => {
    const isDirectiveCandidate = inDirectivePrologue && ts.isExpressionStatement(node) && ts.isStringLiteralLike(node.expression);
    if (inDirectivePrologue && !isDirectiveCandidate) inDirectivePrologue = false;

    units.push({
      group: classifyStatement(node, isDirectiveCandidate),
      name: resolveDeclarationName(node),
      startLine: resolveAttachedStartLine(sourceFile, fullText, node, index === 0 ? notBeforePos : 0),
      endLine: getLine(sourceFile, node.getEnd()),
      node,
    });
  });

  return units;
}

function buildMemberUnits(
  sourceFile: ts.SourceFile,
  fullText: string,
  members: readonly ts.ClassElement[],
): StructuralUnit[] {
  const units: StructuralUnit[] = [];

  for (const node of members) {
    const group = classifyMember(node);
    if (!group) continue;

    units.push({
      group,
      name: resolveDeclarationName(node),
      startLine: resolveAttachedStartLine(sourceFile, fullText, node, 0),
      endLine: getLine(sourceFile, node.getEnd()),
      node,
    });
  }

  return units;
}

export { buildMemberUnits, buildStatementUnits };
