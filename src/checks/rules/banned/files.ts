import type { ScannedSourceFile } from "../../../imports/types.js";
import { matchesGlob } from "../../../shared/globs.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";

function collectBannedFileViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  const rule = options.rules.bannedFiles;
  if (!rule) return [];

  const violations: CodeDisciplineViolation[] = [];

  for (const file of sourceFiles) {
    for (const pattern of rule.patterns) {
      if (!matchesGlob(file.relativeFromProjectRoot, pattern.glob)) continue;

      violations.push({
        rule: "banned-files",
        fix: false,
        filePath: file.relativeFromProjectRoot,
        message: `file path matches banned glob "${pattern.glob}"`,
        details: {
          glob: pattern.glob,
        },
      });
    }
  }

  return violations;
}

export { collectBannedFileViolations };
