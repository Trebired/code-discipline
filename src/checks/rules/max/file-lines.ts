import fs from "node:fs/promises";

import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import { countCodeLines, countPhysicalLines, maskCommentsForLineCounting } from "./code-lines.js";

async function runMaxFileLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxFileLines) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "max-file-lines",
    totalItems: sourceFiles.length,
  });
  const native = loadNativeBinding();
  if (native && !options.progressObserver) {
    const violations = JSON.parse(native.runMaxFileLinesRule(JSON.stringify({
      sourceFiles,
      max: options.rules.maxFileLines.max,
      warning: true,
    }))) as CodeDisciplineViolation[];
    emitRuleCompleted(progress, violations.length);
    return violations;
  }

  const violations: CodeDisciplineViolation[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const text = await fs.readFile(file.absolutePath, "utf8");
    const lineCount = countPhysicalLines(text);
    const codeLineCount = countCodeLines(maskCommentsForLineCounting(text, file.extension));

    if (codeLineCount > options.rules.maxFileLines.max) {
      violations.push({
        rule: "max-file-lines",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `file has ${codeLineCount} lines and exceeds the limit of ${options.rules.maxFileLines.max}`,
        details: {
          lineCount: codeLineCount,
          max: options.rules.maxFileLines.max,
        },
      });
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    if (lineCount > options.rules.maxFileLines.max) {
      violations.push({
        rule: "max-file-lines",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        severity: "warning",
        message: `file has ${lineCount} physical lines, but only ${codeLineCount} code lines count toward the limit of ${options.rules.maxFileLines.max}`,
        details: {
          lineCount,
          codeLineCount,
          max: options.rules.maxFileLines.max,
        },
      });
    }

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runMaxFileLinesRule };
