import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { collectDryCandidates, collectDrySourceDuplicateViolations, createDryViolation } from "./candidates.js";
import { fixDryRule } from "./fix.js";
import { resolveDryHelpers } from "./helpers.js";
import { filterDrySourceFiles } from "./model.js";

async function collectDryViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.rules.dry;
  if (!rule) return [];

  const helpers = await resolveDryHelpers(rule, options);
  const drySourceFiles = filterDrySourceFiles(sourceFiles);
  const candidates = await collectDryCandidates(drySourceFiles, helpers, options);
  const helperViolations = candidates.map((candidate) => createDryViolation(candidate, options));
  const sourceDuplicateViolations = await collectDrySourceDuplicateViolations(drySourceFiles, helpers);
  return [
    ...helperViolations,
    ...sourceDuplicateViolations,
  ];
}

export { collectDryViolations, fixDryRule };
