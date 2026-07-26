import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { collectDrySourceDuplicateViolations } from "./candidates.js";
import { filterDrySourceFiles } from "./model.js";

async function collectDryViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.rules.dry;
  if (!rule) return [];

  const drySourceFiles = filterDrySourceFiles(sourceFiles);
  return collectDrySourceDuplicateViolations(drySourceFiles, rule, options.progressObserver);
}

export { collectDryViolations };
