import { mergeExcludeDirEntries } from "#gqxxrd6ye9fj";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleChunkAt, emitRuleCompleted } from "#efe33sls019o";
import { shouldRunRule } from "#ydyygm5y7vgb";
import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";

type EmptyFoldersNativeResponse = {
  violations: CodeDisciplineViolation[];
  directory_count?: number;
};

type EmptyFoldersNativeFixResponse = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  deleted_files?: number;
  directory_count?: number;
};

function createEmptyFoldersRequest(options: NormalizedCheckCodeDisciplineOptions): string {
  return JSON.stringify({
      projectRoot: options.projectRoot,
      sourceRoot: options.sourceRoot,
      excludeDirs: mergeExcludeDirEntries(options.excludeDirs, options.rules.emptyFolders?.excludeDirs ?? []),
      ignorePatterns: options.ignore?.gitignorePatterns ?? [],
  });
}

function collectEmptyFolderViolations(options: NormalizedCheckCodeDisciplineOptions): CodeDisciplineViolation[] {
  if (!options.rules.emptyFolders || !shouldRunRule("empty-folders", options.onlyRules)) return [];
  const progress = createRuleProgress({
      chunkSize: 1,
      observer: options.progressObserver,
      rule: "empty-folders",
      totalItems: 1,
  });
  const result = JSON.parse(requireNativeBinding().runEmptyFoldersRule(createEmptyFoldersRequest(options))) as EmptyFoldersNativeResponse;
  const violations = Array.isArray(result.violations) ? result.violations : [];
  emitRuleChunkAt(progress, 1, 1, violations.length, {
      chunkItems: result.directory_count ?? 0,
  });
  emitRuleCompleted(progress, violations.length);
  return violations;
}

function fixEmptyFoldersRule(options: NormalizedCheckCodeDisciplineOptions): EmptyFoldersNativeFixResponse {
  const progress = createRuleProgress({
      chunkSize: 1,
      observer: options.progressObserver,
      rule: "empty-folders",
      stage: "fix",
      totalItems: 1,
  });
  const result = JSON.parse(requireNativeBinding().fixEmptyFoldersRule(createEmptyFoldersRequest(options))) as EmptyFoldersNativeFixResponse;
  emitRuleChunkAt(progress, 1, 1, result.violationCount, {
      chunkItems: result.directory_count ?? 0,
      deletedFiles: result.deleted_files ?? 0,
  });
  emitRuleCompleted(progress, result.violationCount, {
      deletedFiles: result.deleted_files ?? 0,
  });
  return result;
}

export { collectEmptyFolderViolations, fixEmptyFoldersRule };
