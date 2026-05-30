import type { CheckCodeDisciplineOptions, NormalizedCheckCodeDisciplineOptions } from "../checks/types.js";
import { normalizeFolderizeCompoundFilesRule, normalizeMaxFileLinesRule } from "./normalize-rule-options.js";
import { normalizeSourceOptions } from "./normalize-source-options.js";

async function normalizeCheckCodeDisciplineOptions(
  options: CheckCodeDisciplineOptions,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  const source = await normalizeSourceOptions(options);

  return {
    ...source,
    rules: {
      maxFileLines: normalizeMaxFileLinesRule(options.rules?.maxFileLines),
      folderizeCompoundFiles: normalizeFolderizeCompoundFilesRule(options.rules?.folderizeCompoundFiles),
    },
  };
}

export { normalizeCheckCodeDisciplineOptions };
