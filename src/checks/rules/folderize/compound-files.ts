import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleCompleted } from "#efe33sls019o";
import { planFolderizeCompoundFiles } from "./plan.js";

function runFolderizeCompoundFilesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  if (!options.rules.folderizeCompoundFiles) return [];

  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "folderize-compound-files",
    totalItems: sourceFiles.length,
  });
  const native = loadNativeBinding();
  if (native && !options.progressObserver) {
    const violations = JSON.parse(native.runFolderizeCompoundFilesRule(JSON.stringify({
      sourceFiles,
      separators: options.rules.folderizeCompoundFiles.separators,
    }))) as CodeDisciplineViolation[];
    emitRuleCompleted(progress, violations.length);
    return violations;
  }

  return planFolderizeCompoundFiles(sourceFiles, options).map((candidate) => ({
    rule: "folderize-compound-files",
    fix: true,
    filePath: candidate.relativeFromProjectRoot,
    message: `file can be grouped under ${candidate.suggestedPath}`,
    suggestedPath: candidate.suggestedPath,
    details: {
      mode: candidate.mode,
      prefix: candidate.prefix,
      remainder: candidate.remainder,
      separator: candidate.separator,
    },
  }));
}

export { runFolderizeCompoundFilesRule };
