import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleCompleted } from "#efe33sls019o";

async function runMaxFileLinesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.maxFileLines) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "max-file-lines",
    totalItems: sourceFiles.length,
  });
  const violations = JSON.parse(requireNativeBinding().runMaxFileLinesRule(JSON.stringify({
    sourceFiles,
    max: options.rules.maxFileLines.max,
    warning: true,
  }))) as CodeDisciplineViolation[];
  emitRuleCompleted(progress, violations.length);
  return violations;
}

export { runMaxFileLinesRule };
