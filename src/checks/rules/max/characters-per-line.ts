import fs from "node:fs/promises";

import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../progress.js";

function countCharacters(line: string): number {
  return Array.from(line).length;
}

async function runMaxCharactersPerLineRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxCharactersPerLine) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "max-characters-per-line",
    totalItems: sourceFiles.length,
  });
  const violations: CodeDisciplineViolation[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const lines = (await fs.readFile(file.absolutePath, "utf8")).split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const characterCount = countCharacters(lines[lineIndex] ?? "");
      if (characterCount <= options.rules.maxCharactersPerLine.max) continue;

      violations.push({
        rule: "max-characters-per-line",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `line ${lineIndex + 1} has ${characterCount} characters and exceeds the limit of ${options.rules.maxCharactersPerLine.max}`,
        details: {
          line: lineIndex + 1,
          characterCount,
          max: options.rules.maxCharactersPerLine.max,
        },
      });
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runMaxCharactersPerLineRule };
