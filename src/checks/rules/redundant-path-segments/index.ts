import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleCompleted } from "#efe33sls019o";
import { planRedundantPathSegments } from "./plan.js";

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
  const native = loadNativeBinding();
  if (native && !options.progressObserver) {
    const violations = JSON.parse(native.runRedundantPathSegmentsRule(JSON.stringify({
      sourceFiles,
      separators: options.rules.redundantPathSegments.separators,
    }))) as CodeDisciplineViolation[];
    emitRuleCompleted(progress, violations.length);
    return violations;
  }

  return planRedundantPathSegments(sourceFiles, options).map((candidate) => ({
    rule: "redundant-path-segments",
    fix: true,
    filePath: candidate.relativeFromProjectRoot,
    message: `file path should be normalized to ${candidate.suggestedPath}`,
    suggestedPath: candidate.suggestedPath,
    details: {
      mode: candidate.mode,
      prefix: candidate.prefix,
      remainder: candidate.remainder,
      ...(candidate.pathSegment ? { pathSegment: candidate.pathSegment } : {}),
      separator: candidate.separator,
    },
  }));
}

export { runRedundantPathSegmentsRule };
