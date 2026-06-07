import type {
  CheckCodeDisciplineOptions,
  CodeDisciplineMode,
  FixCodeDisciplineOptions,
  NormalizedCheckCodeDisciplineOptions,
} from "../checks/types.js";
import { normalizeOnlyRules } from "../checks/rule-slugs.js";
import {
  normalizeDryRule,
  normalizeFolderizeCompoundFilesRule,
  normalizeMaxFileLinesRule,
  normalizeMaxFunctionLinesRule,
  normalizeSyncImportsRule,
} from "./normalize-rule-options.js";
import { normalizeSourceOptions } from "./normalize-source-options.js";

async function normalizeCheckCodeDisciplineOptions(
  options: CheckCodeDisciplineOptions | FixCodeDisciplineOptions,
  mode: CodeDisciplineMode,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  const source = await normalizeSourceOptions(options);

  return {
    ...source,
    configPath: options.configPath,
    logging: {
      enabled: options.logging?.enabled ?? Boolean(options.logging?.logger || options.logging?.adapter),
      logger: options.logging?.logger,
      adapter: options.logging?.adapter,
      quiet: options.logging?.quiet ?? false,
    },
    onlyRules: normalizeOnlyRules(mode, options.onlyRules, options.rules),
    rules: {
      dry: normalizeDryRule(options.rules?.dry),
      maxFileLines: normalizeMaxFileLinesRule(options.rules?.maxFileLines),
      maxFunctionLines: normalizeMaxFunctionLinesRule(options.rules?.maxFunctionLines),
      folderizeCompoundFiles: normalizeFolderizeCompoundFilesRule(options.rules?.folderizeCompoundFiles),
      syncImports: normalizeSyncImportsRule(options.rules?.syncImports),
    },
  };
}

export { normalizeCheckCodeDisciplineOptions };
