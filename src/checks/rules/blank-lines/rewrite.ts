import ts from "typescript";

import { buildMemberUnits, buildStatementUnits } from "./classify.js";
import { resolveFileHeaderSegments } from "./comments.js";
import type { BoundaryEdit, HeaderSegment, StructuralGroup, StructuralUnit } from "./types.js";

const COMPACT_GROUPS = new Set<StructuralGroup>([
    "directive",
    "import",
    "export",
    "type",
    "variable",
    "execution",
    "class-field",
]);

const OVERLOAD_LIKE_GROUPS = new Set<StructuralGroup>([
    "function",
    "class-method",
    "class-accessor",
]);

function isCompactPair(previous: StructuralUnit, next: StructuralUnit): boolean {
  if (previous.group !== next.group) return false;
  if (COMPACT_GROUPS.has(previous.group)) return true;
  return OVERLOAD_LIKE_GROUPS.has(previous.group) && Boolean(previous.name) && previous.name === next.name;
}

function computePairwiseEdits(units: StructuralUnit[]): BoundaryEdit[] {
  const edits: BoundaryEdit[] = [];

  for (let index = 1; index < units.length; index += 1) {
    const previous = units[index - 1]!;
    const next = units[index]!;
    const gap = next.startLine - previous.endLine - 1;
    const target = isCompactPair(previous, next) ? Math.min(gap, 1) : 1;

    if (target === gap) continue;

    edits.push({
        atLine: previous.endLine + 1,
        removeCount: Math.max(0, gap - target),
        insertCount: Math.max(0, target - gap),
    });
  }

  return edits;
}

function computeHeaderEdits(headerSegments: HeaderSegment[], firstUnit: StructuralUnit | undefined): BoundaryEdit[] {
  if (headerSegments.length === 0 || !firstUnit) return [];

  const edits: BoundaryEdit[] = [];

  for (let index = 1; index < headerSegments.length; index += 1) {
    const previous = headerSegments[index - 1]!;
    const next = headerSegments[index]!;
    const gap = next.startLine - previous.endLine - 1;
    const target = Math.min(gap, 1);
    if (target === gap) continue;

    edits.push({ atLine: previous.endLine + 1, removeCount: gap - target, insertCount: 0 });
  }

  const lastHeader = headerSegments[headerSegments.length - 1]!;
  const gap = firstUnit.startLine - lastHeader.endLine - 1;

  if (gap !== 1) {
    edits.push({
        atLine: lastHeader.endLine + 1,
        removeCount: Math.max(0, gap - 1),
        insertCount: Math.max(0, 1 - gap),
    });
  }

  return edits;
}

function isClassLikeDeclaration(node: ts.Node): node is ts.ClassLikeDeclaration {
  return ts.isClassDeclaration(node) || ts.isClassExpression(node);
}

function collectNestedEdits(sourceFile: ts.SourceFile, fullText: string, units: StructuralUnit[]): BoundaryEdit[] {
  const edits: BoundaryEdit[] = [];

  for (const unit of units) {
    if (isClassLikeDeclaration(unit.node)) {
      const memberUnits = buildMemberUnits(sourceFile, fullText, unit.node.members);
      edits.push(...computePairwiseEdits(memberUnits));
      continue;
    }

    if (ts.isModuleDeclaration(unit.node) && unit.node.body && ts.isModuleBlock(unit.node.body)) {
      const nestedUnits = buildStatementUnits(sourceFile, fullText, unit.node.body.statements, 0);
      edits.push(...computePairwiseEdits(nestedUnits));
      edits.push(...collectNestedEdits(sourceFile, fullText, nestedUnits));
    }
  }

  return edits;
}

function collectBoundaryEdits(sourceFile: ts.SourceFile, fullText: string): BoundaryEdit[] {
  const headerSegments = resolveFileHeaderSegments(sourceFile, fullText);
  const notBeforePos = headerSegments.length > 0 ? headerSegments[headerSegments.length - 1]!.endPos : 0;
  const topUnits = buildStatementUnits(sourceFile, fullText, sourceFile.statements, notBeforePos);

  return [
    ...computeHeaderEdits(headerSegments, topUnits[0]),
    ...computePairwiseEdits(topUnits),
    ...collectNestedEdits(sourceFile, fullText, topUnits),
  ];
}

type ApplyBoundaryEditsResult = {
  text: string;
  changed: boolean;
  boundaryCount: number;
  insertedBlankLines: number;
  removedBlankLines: number;
};

function applyBoundaryEdits(text: string, edits: BoundaryEdit[]): ApplyBoundaryEditsResult {
  if (edits.length === 0) {
    return { text, changed: false, boundaryCount: 0, insertedBlankLines: 0, removedBlankLines: 0 };
  }

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r\n|\n/);
  const sorted = [...edits].sort((left, right) => right.atLine - left.atLine);

  let insertedBlankLines = 0;
  let removedBlankLines = 0;

  for (const edit of sorted) {
    lines.splice(edit.atLine - 1, edit.removeCount, ...Array.from({ length: edit.insertCount }, () => ""));
    insertedBlankLines += edit.insertCount;
    removedBlankLines += edit.removeCount;
  }

  return {
    text: lines.join(newline),
    changed: true,
    boundaryCount: edits.length,
    insertedBlankLines,
    removedBlankLines,
  };
}

function rewriteStructuralBlankLines(sourceFile: ts.SourceFile, fullText: string): ApplyBoundaryEditsResult {
  const edits = collectBoundaryEdits(sourceFile, fullText);
  return applyBoundaryEdits(fullText, edits);
}

export { applyBoundaryEdits, collectBoundaryEdits, rewriteStructuralBlankLines };
export type { ApplyBoundaryEditsResult };
