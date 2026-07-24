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
  normalizeFolderizeCompoundFilesRule,
  normalizeMaxCharactersPerLineRule,
  normalizeMaxFileLinesRule,
  normalizeMaxFunctionLinesRule,
  normalizeMinDeclarationNameRule,
  normalizeMinFileLinesRule,
  normalizeRemoveCommentsRule,
  normalizeSyncImportsRule,
} from "./rule-options.js";
import { InvalidCodeDisciplineConfigError } from "../../shared/errors.js";
import { normalizeLoggingOptions } from "./logging-options.js";
import { normalizeSourceOptions } from "./source-options.js";

function assertRemovedCheckOptions(options: Record<string, unknown>): void {
  if ("evasionGuards" in options) {
    throw new InvalidCodeDisciplineConfigError("evasionGuards is no longer supported; use rules.maxCharactersPerLine instead", {
      key: "evasionGuards",
    });
  }
}

async function normalizeCheckCodeDisciplineOptions(
  options: CheckCodeDisciplineOptions | FixCodeDisciplineOptions,
  mode: CodeDisciplineMode,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  assertRemovedCheckOptions(options as Record<string, unknown>);
  const source = await normalizeSourceOptions(options);

  return {
    ...source,
    configPath: options.configPath,
    logging: normalizeLoggingOptions(options.logging, "logging"),
    onlyRules: normalizeOnlyRules(mode, options.onlyRules, options.rules),
    progressObserver: options.progressObserver,
    rules: {
      bannedPatterns: normalizeBannedPatternsRule(options.rules?.bannedPatterns),
      bannedFiles: normalizeBannedFilesRule(options.rules?.bannedFiles),
      dry: normalizeDryRule(options.rules?.dry),
      minFileLines: normalizeMinFileLinesRule(options.rules?.minFileLines),
      minDeclarationName: normalizeMinDeclarationNameRule(options.rules?.minDeclarationName),
      maxFileLines: normalizeMaxFileLinesRule(options.rules?.maxFileLines),
      maxCharactersPerLine: normalizeMaxCharactersPerLineRule(options.rules?.maxCharactersPerLine),
      maxFunctionLines: normalizeMaxFunctionLinesRule(options.rules?.maxFunctionLines),
      folderizeCompoundFiles: normalizeFolderizeCompoundFilesRule(options.rules?.folderizeCompoundFiles),
      syncImports: normalizeSyncImportsRule(options.rules?.syncImports),
      removeComments: normalizeRemoveCommentsRule(options.rules?.removeComments),
    },
  };
}

export { normalizeCheckCodeDisciplineOptions };
