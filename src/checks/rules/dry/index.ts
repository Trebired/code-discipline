import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { collectDryCandidates, createDryViolation } from "./candidates.js";
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
  const candidates = await collectDryCandidates(filterDrySourceFiles(sourceFiles), helpers, options);
  return candidates.map((candidate) => createDryViolation(candidate, options));
}

export { collectDryViolations, fixDryRule };
