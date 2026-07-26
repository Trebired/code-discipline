import fs from "node:fs/promises";

import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { FixFailureError } from "#4f8hale01wb4";
import { matchesGlob } from "#49ihfa399fpp";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";

const BANNED_FILES_FIX_CHUNK_SIZE = 250;

function collectBannedFileViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  const rule = options.rules.bannedFiles;
  if (!rule) return [];

  const violations: CodeDisciplineViolation[] = [];
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "banned-files",
    totalItems: sourceFiles.length,
  });

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
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

    emitRuleChunk(progress, index + 1, violations.length);
  }

  emitRuleCompleted(progress, violations.length);
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
  const progress = createRuleProgress({
    chunkSize: BANNED_FILES_FIX_CHUNK_SIZE,
    observer: options.progressObserver,
    rule: "banned-files",
    stage: "fix",
    totalItems: filesToDelete.length,
  });
  let deletedFiles = 0;

  try {
    for (let index = 0; index < filesToDelete.length; index += BANNED_FILES_FIX_CHUNK_SIZE) {
      const chunk = filesToDelete.slice(index, index + BANNED_FILES_FIX_CHUNK_SIZE);
      await Promise.all(chunk.map((file) => fs.unlink(file.absolutePath)));
      deletedFiles += chunk.length;
      emitRuleChunk(progress, deletedFiles, 0, { deletedFiles });
    }
  } catch (error) {
    throw new FixFailureError("banned-files fix failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  emitRuleCompleted(progress, 0, { deletedFiles });
  return {
    ok: true,
    violationCount: 0,
    violations: [],
    deleted_files: deletedFiles,
  };
}

export { collectBannedFileViolations, fixBannedFilesRule };
