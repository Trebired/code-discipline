import type { CheckCodeDisciplineOptions, NormalizedCheckCodeDisciplineOptions } from "../checks/types.js";
import {
  normalizeFolderizeCompoundFilesRule,
  normalizeMaxFileLinesRule,
  normalizeMaxFunctionLinesRule,
  normalizeSyncImportsRule,
} from "./normalize-rule-options.js";
import { normalizeSourceOptions } from "./normalize-source-options.js";

async function normalizeCheckCodeDisciplineOptions(
  options: CheckCodeDisciplineOptions,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  const source = await normalizeSourceOptions(options);

  return {
    ...source,
    logging: {
      enabled: options.logging?.enabled ?? Boolean(options.logging?.logger || options.logging?.adapter),
      logger: options.logging?.logger,
      adapter: options.logging?.adapter,
      quiet: options.logging?.quiet ?? false,
    },
    rules: {
      maxFileLines: normalizeMaxFileLinesRule(options.rules?.maxFileLines),
      maxFunctionLines: normalizeMaxFunctionLinesRule(options.rules?.maxFunctionLines),
      folderizeCompoundFiles: normalizeFolderizeCompoundFilesRule(options.rules?.folderizeCompoundFiles),
      syncImports: normalizeSyncImportsRule(options.rules?.syncImports),
    },
  };
}

export { normalizeCheckCodeDisciplineOptions };
