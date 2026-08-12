import fs from "node:fs/promises";

import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { supportsMinDeclarationName } from "#87jyjzn68rrk";
import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { collectWithParseFailure } from "#lvwwpxtj6az5";
import {
  collectLanguageDeclarations,
  measureDeclarationName,
} from "#nwpxjl4s2zib";
import type { NamedDeclaration } from "./shared.js";

function createMinDeclarationNameViolation(
  file: ScannedSourceFile,
  declaration: NamedDeclaration,
  min: number,
  length: number,
): CodeDisciplineViolation {
  const characterLabel = length === 1 ? "character" : "characters";
  return {
    rule: "min-declaration-name",
    fix: false,
    filePath: file.relativeFromProjectRoot,
    message: `${declaration.kind} ${declaration.name} has ${length} ${characterLabel} and is below the minimum name length of ${min}`,
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
    if (!supportsMinDeclarationName(file.extension)) {
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    const text = await fs.readFile(file.absolutePath, "utf8");
    const declarations = await collectWithParseFailure(
      "min-declaration-name",
      file.relativeFromProjectRoot,
      violations,
      () => collectLanguageDeclarations(text, file.extension, file.absolutePath),
    );
    for (const declaration of declarations ?? []) {
      const length = measureDeclarationName(declaration.name);
      if (length >= options.rules.minDeclarationName.min) continue;
      const violation = createMinDeclarationNameViolation(file, declaration, options.rules.minDeclarationName.min, length);
      violations.push(violation);
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runMinDeclarationNameRule };
