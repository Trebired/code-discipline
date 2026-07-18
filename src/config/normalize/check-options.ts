import type {
  CheckCodeDisciplineOptions,
  CodeDisciplineMode,
  FixCodeDisciplineOptions,
  NormalizedCheckCodeDisciplineOptions,
} from "../../checks/types.js";
import { normalizeOnlyRules } from "../../checks/rule-slugs.js";
import {
  normalizeBannedPatternsRule,
  normalizeBannedFilesRule,
  normalizeDryRule,
  normalizeEvasionGuardsOptions,
  normalizeFolderizeCompoundFilesRule,
  normalizeMaxFileLinesRule,
  normalizeMaxFunctionLinesRule,
  normalizeRemoveCommentsRule,
  normalizeSyncImportsRule,
} from "./rule-options.js";
import { normalizeLoggingOptions } from "./logging-options.js";
import { normalizeSourceOptions } from "./source-options.js";

async function normalizeCheckCodeDisciplineOptions(
  options: CheckCodeDisciplineOptions | FixCodeDisciplineOptions,
  mode: CodeDisciplineMode,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  const source = await normalizeSourceOptions(options);

  return {
    ...source,
    configPath: options.configPath,
    logging: normalizeLoggingOptions(options.logging, "logging"),
    onlyRules: normalizeOnlyRules(mode, options.onlyRules, options.rules, options.evasionGuards),
    progressObserver: options.progressObserver,
    rules: {
      bannedPatterns: normalizeBannedPatternsRule(options.rules?.bannedPatterns),
      bannedFiles: normalizeBannedFilesRule(options.rules?.bannedFiles),
      dry: normalizeDryRule(options.rules?.dry),
      maxFileLines: normalizeMaxFileLinesRule(options.rules?.maxFileLines),
      maxFunctionLines: normalizeMaxFunctionLinesRule(options.rules?.maxFunctionLines),
      folderizeCompoundFiles: normalizeFolderizeCompoundFilesRule(options.rules?.folderizeCompoundFiles),
      syncImports: normalizeSyncImportsRule(options.rules?.syncImports),
      removeComments: normalizeRemoveCommentsRule(options.rules?.removeComments),
    },
    evasionGuards: normalizeEvasionGuardsOptions(options.evasionGuards),
  };
}

export { normalizeCheckCodeDisciplineOptions };
