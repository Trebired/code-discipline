import ts from "typescript";

import { expandLineRemovalRange, parseSource } from "./module-specifiers.js";
import type { TextReplacement } from "./module-specifiers.js";

type DeadImportViolation = {
  name: string;
};

type DeadImportDeclarationChange = {
  replacement: TextReplacement;
  removedNames: string[];
};

function collectUsedIdentifierNames(sourceFile: ts.SourceFile): Set<string> {
  const used = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return used;
}

function findDeclarationChange(
  node: ts.ImportDeclaration,
  sourceFile: ts.SourceFile,
  text: string,
  usedNames: Set<string>,
): DeadImportDeclarationChange | null {
  const clause = node.importClause;
  if (!clause) return null;

  const removedNames: string[] = [];
  const pieces: string[] = [];

  if (clause.name) {
    if (usedNames.has(clause.name.text)) {
      pieces.push(clause.name.getText(sourceFile));
    } else {
      removedNames.push(clause.name.text);
    }
  }

  const namedBindings = clause.namedBindings;

  if (namedBindings && ts.isNamespaceImport(namedBindings)) {
    if (usedNames.has(namedBindings.name.text)) {
      pieces.push(namedBindings.getText(sourceFile));
    } else {
      removedNames.push(namedBindings.name.text);
    }
  }

  if (namedBindings && ts.isNamedImports(namedBindings)) {
    const survivors: string[] = [];
    for (const element of namedBindings.elements) {
      if (usedNames.has(element.name.text)) {
        survivors.push(element.getText(sourceFile));
      } else {
        removedNames.push(element.name.text);
      }
    }
    if (survivors.length > 0) {
      pieces.push(`{ ${survivors.join(", ")} }`);
    }
  }

  if (removedNames.length === 0) return null;

  if (pieces.length === 0) {
    const range = expandLineRemovalRange(text, node.getStart(sourceFile), node.getEnd())
      ?? { start: node.getStart(sourceFile), end: node.getEnd() };
    return {
      replacement: { start: range.start, end: range.end, value: "" },
      removedNames,
    };
  }

  return {
    replacement: {
      start: clause.getStart(sourceFile),
      end: clause.getEnd(),
      value: pieces.join(", "),
    },
    removedNames,
  };
}

function collectDeadImportChanges(text: string, filePath: string): DeadImportDeclarationChange[] {
  const sourceFile = parseSource(text, filePath);
  const usedNames = collectUsedIdentifierNames(sourceFile);
  const changes: DeadImportDeclarationChange[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const change = findDeclarationChange(statement, sourceFile, text, usedNames);
    if (change) changes.push(change);
  }

  return changes;
}

function collectDeadImportViolations(text: string, filePath: string): DeadImportViolation[] {
  return collectDeadImportChanges(text, filePath)
    .flatMap((change) => change.removedNames.map((name) => ({ name })));
}

function collectDeadImportRemovals(text: string, filePath: string): TextReplacement[] {
  return collectDeadImportChanges(text, filePath).map((change) => change.replacement);
}

export { collectDeadImportRemovals, collectDeadImportViolations };
export type { DeadImportViolation };
