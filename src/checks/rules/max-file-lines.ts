import fs from "node:fs/promises";

import type { NormalizedCheckCodeDisciplineOptions } from "../types.js";
import type { ScannedSourceFile } from "../../imports/types.js";
import type { CodeDisciplineViolation } from "../../shared/discipline-types.js";

function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

async function runMaxFileLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxFileLines) return [];

  const violations: CodeDisciplineViolation[] = [];

  for (const file of sourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const lineCount = countLines(text);

    if (lineCount <= options.rules.maxFileLines.max) continue;

    violations.push({
      rule: "max-file-lines",
      severity: options.rules.maxFileLines.severity,
      fix: false,
      filePath: file.relativeFromProjectRoot,
      message: `file has ${lineCount} lines and exceeds the limit of ${options.rules.maxFileLines.max}`,
      details: {
        lineCount,
        max: options.rules.maxFileLines.max,
      },
    });
  }

  return violations;
}

export { runMaxFileLinesRule };
