import fs from "node:fs/promises";

import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { loadNativeBinding } from "../../../native/native.js";
import { countCodeLines, countPhysicalLines, maskCommentsForLineCounting } from "./code-lines.js";

async function runMaxFileLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxFileLines) return [];

  const native = loadNativeBinding();
  if (native) {
    return JSON.parse(native.runMaxFileLinesRule(JSON.stringify({
      sourceFiles,
      max: options.rules.maxFileLines.max,
      warning: true,
    }))) as CodeDisciplineViolation[];
  }

  const violations: CodeDisciplineViolation[] = [];

  for (const file of sourceFiles) {
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
  }

  return violations;
}

export { runMaxFileLinesRule };
