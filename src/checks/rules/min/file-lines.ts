import fs from "node:fs/promises";

import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../progress.js";
import { countCodeLines, maskCommentsForLineCounting } from "../max/code-lines.js";

async function runMinFileLinesRule(
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
      violations.push({
        rule: "min-file-lines",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `file has ${lineCount} lines and is at or below the banned minimum of ${options.rules.minFileLines.min}`,
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

export { runMinFileLinesRule };
