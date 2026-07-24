import fs from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { parseSource } from "../../../imports/module-specifiers.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { isTypeScriptFamilyExtension } from "../../../shared/languages.js";
import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../progress.js";
import { getStartLine } from "../typescript-functions.js";

type NamedDeclaration = {
  kind: "const" | "function";
  line: number;
  name: string;
};

function isConstDeclaration(node: ts.VariableDeclaration): boolean {
  return (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0;
}

function collectNamedDeclarations(sourceFile: ts.SourceFile): NamedDeclaration[] {
  const declarations: NamedDeclaration[] = [];

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      declarations.push({
        kind: "function",
        line: getStartLine(sourceFile, node.name),
        name: node.name.text,
      });
    }

    if (ts.isVariableDeclaration(node) && isConstDeclaration(node) && ts.isIdentifier(node.name)) {
      declarations.push({
        kind: "const",
        line: getStartLine(sourceFile, node.name),
        name: node.name.text,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return declarations;
}

function createMinDeclarationNameViolation(
  file: ScannedSourceFile,
  declaration: NamedDeclaration,
  min: number,
  length: number,
): CodeDisciplineViolation {
  return {
    rule: "min-declaration-name",
    fix: false,
    filePath: file.relativeFromProjectRoot,
    message: `${declaration.kind} ${declaration.name} has ${length} character${length === 1 ? "" : "s"} and is below the minimum name length of ${min}`,
    details: {
      declarationKind: declaration.kind,
      declarationName: declaration.name,
      line: declaration.line,
      length,
      min,
    },
  };
}

async function runMinDeclarationNameRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.minDeclarationName) return [];

  const violations: CodeDisciplineViolation[] = [];
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "min-declaration-name",
    totalItems: sourceFiles.length,
  });

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!isTypeScriptFamilyExtension(path.extname(file.absolutePath).toLowerCase())) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const text = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(text, file.absolutePath);
    for (const declaration of collectNamedDeclarations(sourceFile)) {
      const length = Array.from(declaration.name).length;
      if (length >= options.rules.minDeclarationName.min) continue;
      violations.push(createMinDeclarationNameViolation(file, declaration, options.rules.minDeclarationName.min, length));
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { collectNamedDeclarations, runMinDeclarationNameRule };
