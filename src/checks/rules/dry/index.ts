import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { collectDrySourceDuplicateViolations } from "./candidates.js";
import { filterDrySourceFiles } from "./model.js";

async function collectDryViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const rule = options.rules.dry;
  if (!rule) return [];

  const drySourceFiles = filterDrySourceFiles(sourceFiles);
  return collectDrySourceDuplicateViolations(drySourceFiles);
}

export { collectDryViolations };
