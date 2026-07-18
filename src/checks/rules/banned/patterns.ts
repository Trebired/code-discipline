import fs from "node:fs/promises";

import type { ScannedSourceFile } from "../../../imports/types.js";
import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";

function countOccurrences(text: string, pattern: string): number {
  if (!pattern) return 0;

  let count = 0;
  let index = 0;

  while (index <= text.length - pattern.length) {
    const matchIndex = text.indexOf(pattern, index);
    if (matchIndex < 0) break;
    count += 1;
    index = matchIndex + 1;
  }

  return count;
}

async function collectBannedPatternViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.rules.bannedPatterns;
  if (!rule) return [];

  const violations: CodeDisciplineViolation[] = [];

  for (const file of sourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const normalizedText = text.toLowerCase();

    for (const pattern of rule.patterns) {
      if (pattern.allowedFiles.includes(file.relativeFromProjectRoot)) continue;
      if (!normalizedText.includes(pattern.normalizedValue)) continue;

      const occurrences = countOccurrences(normalizedText, pattern.normalizedValue);
      violations.push({
        rule: "banned-patterns",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `file contains banned pattern "${pattern.value}"${occurrences > 1 ? ` ${occurrences} times` : ""}`,
        details: {
          pattern: pattern.value,
          occurrences,
          allowedFiles: pattern.allowedFiles,
        },
      });
    }
  }

  return violations;
}

export { collectBannedPatternViolations };
