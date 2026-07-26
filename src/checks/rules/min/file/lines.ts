import fs from "node:fs/promises";

import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { countCodeLines, maskCommentsForLineCounting } from "#mv1bbdtri77n";

async function collectMinFileLineViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.minFileLines) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "min-file-lines",
    totalItems: sourceFiles.length,
  });
  const violations: CodeDisciplineViolation[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const text = await fs.readFile(file.absolutePath, "utf8");
    const lineCount = countCodeLines(maskCommentsForLineCounting(text, file.extension));

    if (lineCount <= options.rules.minFileLines.min) {
      const lineLabel = lineCount === 1 ? "line" : "lines";
      violations.push({
        rule: "min-file-lines",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `file has ${lineCount} ${lineLabel} and is at or below the banned minimum of ${options.rules.minFileLines.min}`,
        details: {
          lineCount,
          min: options.rules.minFileLines.min,
        },
      });
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

async function runMinFileLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  return collectMinFileLineViolations(sourceFiles, options);
}

export { collectMinFileLineViolations, runMinFileLinesRule };
