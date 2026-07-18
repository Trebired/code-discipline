import fs from "node:fs/promises";

import type { ScannedSourceFile } from "../../../imports/types.js";
import { FixFailureError } from "../../../shared/errors.js";
import { matchesGlob } from "../../../shared/globs.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "../../types.js";

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

async function fixBannedFilesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const violations = collectBannedFileViolations(sourceFiles, options);
  if (violations.length === 0) {
    return {
      ok: true,
      violationCount: 0,
      violations: [],
      deleted_files: 0,
    };
  }

  const filesByRelativePath = new Map(sourceFiles.map((file) => [file.relativeFromProjectRoot, file]));
  const filesToDelete = [...new Set(violations.map((violation) => violation.filePath))]
    .map((filePath) => filesByRelativePath.get(filePath))
    .filter((file): file is ScannedSourceFile => Boolean(file));

  try {
    await Promise.all(filesToDelete.map((file) => fs.unlink(file.absolutePath)));
  } catch (error) {
    throw new FixFailureError("banned-files fix failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    ok: true,
    violationCount: 0,
    violations: [],
    deleted_files: filesToDelete.length,
  };
}

export { collectBannedFileViolations, fixBannedFilesRule };
