import { mergeExcludeDirEntries } from "#gqxxrd6ye9fj";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleChunkAt, emitRuleCompleted } from "#efe33sls019o";
import { shouldRunRule } from "#ydyygm5y7vgb";
import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";

type RemoveEmptyFoldersNativeResponse = {
  violations: CodeDisciplineViolation[];
  directory_count?: number;
};

type RemoveEmptyFoldersNativeFixResponse = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  deleted_files?: number;
  directory_count?: number;
};

function createRemoveEmptyFoldersRequest(options: NormalizedCheckCodeDisciplineOptions): string {
  return JSON.stringify({
      projectRoot: options.projectRoot,
      sourceRoot: options.sourceRoot,
      excludeDirs: mergeExcludeDirEntries(options.excludeDirs, options.rules.removeEmptyFolders?.excludeDirs ?? []),
      ignorePatterns: options.ignore?.gitignorePatterns ?? [],
  });
}

function collectRemoveEmptyFolderViolations(options: NormalizedCheckCodeDisciplineOptions): CodeDisciplineViolation[] {
  if (!options.rules.removeEmptyFolders || !shouldRunRule("remove-empty-folders", options.onlyRules)) return [];
  const progress = createRuleProgress({
      chunkSize: 1,
      observer: options.progressObserver,
      rule: "remove-empty-folders",
      totalItems: 1,
  });
  const result = JSON.parse(
    requireNativeBinding().runRemoveEmptyFoldersRule(createRemoveEmptyFoldersRequest(options)),
  ) as RemoveEmptyFoldersNativeResponse;
  const violations = Array.isArray(result.violations) ? result.violations : [];
  emitRuleChunkAt(progress, 1, 1, violations.length, {
      chunkItems: result.directory_count ?? 0,
  });
  emitRuleCompleted(progress, violations.length);
  return violations;
}

function fixRemoveEmptyFoldersRule(options: NormalizedCheckCodeDisciplineOptions): RemoveEmptyFoldersNativeFixResponse {
  const progress = createRuleProgress({
      chunkSize: 1,
      observer: options.progressObserver,
      rule: "remove-empty-folders",
      stage: "fix",
      totalItems: 1,
  });
  const result = JSON.parse(
    requireNativeBinding().fixRemoveEmptyFoldersRule(createRemoveEmptyFoldersRequest(options)),
  ) as RemoveEmptyFoldersNativeFixResponse;
  emitRuleChunkAt(progress, 1, 1, result.violationCount, {
      chunkItems: result.directory_count ?? 0,
      deletedFiles: result.deleted_files ?? 0,
  });
  emitRuleCompleted(progress, result.violationCount, {
      deletedFiles: result.deleted_files ?? 0,
  });
  return result;
}

export { collectRemoveEmptyFolderViolations, fixRemoveEmptyFoldersRule };
