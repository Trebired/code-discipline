import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleCompleted } from "#efe33sls019o";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";

function createRemoveCommentsViolation(args: {
  filePath: string;
  commentCount: number;
  lineComments: number;
  blockComments: number;
}): CodeDisciplineViolation {
  return {
    rule: "remove-comments",
    fix: true,
    filePath: args.filePath,
    message: `file contains ${args.commentCount} removable comment(s)`,
    details: {
      commentCount: args.commentCount,
      lineComments: args.lineComments,
      blockComments: args.blockComments,
    },
  };
}

async function collectRemoveCommentsViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "remove-comments",
    totalItems: sourceFiles.length,
  });
  const violations = JSON.parse(requireNativeBinding().collectRemoveCommentsViolations(JSON.stringify({
    sourceFiles,
    excludedCommentPatterns: options.rules.removeComments?.exclude ?? [],
  }))) as CodeDisciplineViolation[];
  emitRuleCompleted(progress, violations.length);
  return violations;
}

async function fixRemoveCommentsRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "remove-comments",
    stage: "fix",
    totalItems: sourceFiles.length,
  });
  const result = JSON.parse(requireNativeBinding().fixRemoveCommentsRule(JSON.stringify({
    sourceFiles,
    excludedCommentPatterns: options.rules.removeComments?.exclude ?? [],
  }))) as FixCodeDisciplineRuleResult;
  emitRuleCompleted(progress, result.violationCount, {
    removedComments: result.removed_comments,
    rewrittenFiles: result.rewritten_files,
  });
  return result;
}

export { collectRemoveCommentsViolations, fixRemoveCommentsRule };
