import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleCompleted } from "#efe33sls019o";
import { planSourceFileStructure } from "./plan.js";

function runSourceFileStructureRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  if (!options.rules.sourceFileStructure) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "source-file-structure",
    totalItems: sourceFiles.length,
  });
  const native = loadNativeBinding();
  if (native && !options.progressObserver) {
    const violations = JSON.parse(native.runSourceFileStructureRule(JSON.stringify({
      roleSuffixes: options.rules.sourceFileStructure.roleSuffixes,
      sourceFiles,
      separators: options.rules.sourceFileStructure.separators,
    }))) as CodeDisciplineViolation[];
    emitRuleCompleted(progress, violations.length);
    return violations;
  }

  return planSourceFileStructure(sourceFiles, options).map((candidate) => ({
    rule: "source-file-structure",
    fix: true,
    filePath: candidate.relativeFromProjectRoot,
    message: `file path should be normalized to ${candidate.suggestedPath}`,
    suggestedPath: candidate.suggestedPath,
    details: {
      mode: candidate.mode,
      prefix: candidate.prefix,
      remainder: candidate.remainder,
      ...(candidate.roleSuffix ? { roleSuffix: candidate.roleSuffix } : {}),
      separator: candidate.separator,
    },
  }));
}

export { runSourceFileStructureRule };
