import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleCompleted } from "#efe33sls019o";

function runRedundantPathSegmentsRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  if (!options.rules.redundantPathSegments) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "redundant-path-segments",
    totalItems: sourceFiles.length,
  });
  const violations = JSON.parse(requireNativeBinding().runRedundantPathSegmentsRule(JSON.stringify({
    sourceFiles,
    separators: options.rules.redundantPathSegments.separators,
  }))) as CodeDisciplineViolation[];
  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runRedundantPathSegmentsRule };
