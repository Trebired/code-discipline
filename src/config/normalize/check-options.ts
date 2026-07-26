import type {
  CheckCodeDisciplineOptions,
  CodeDisciplineMode,
  FixCodeDisciplineOptions,
  NormalizedCheckCodeDisciplineOptions,
} from "#uqbg4indzud7";
import { normalizeOnlyRules } from "#ydyygm5y7vgb";
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
  normalizeStructuralBlankLinesRule,
  normalizeSyncImportsRule,
} from "./rule-options.js";
import { normalizeFormatters } from "./formatter-options.js";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { normalizeLoggingOptions } from "./logging-options.js";
import { applyCodeDisciplinePresets } from "./presets.js";
import { normalizeSourceOptions } from "./source-options.js";

function assertRemovedCheckOptions(options: Record<string, unknown>): void {
  if ("evasionGuards" in options) {
    throw new InvalidCodeDisciplineConfigError("evasionGuards is no longer supported; use rules.maxCharactersPerLine instead", {
      key: "evasionGuards",
    });
  }

  if ("tsconfigPaths" in options) {
    throw new InvalidCodeDisciplineConfigError("tsconfigPaths is no longer supported; use rules.syncImports.runtime instead", {
      key: "tsconfigPaths",
    });
  }
}

async function normalizeCheckCodeDisciplineOptions(
  options: CheckCodeDisciplineOptions | FixCodeDisciplineOptions,
  mode: CodeDisciplineMode,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  assertRemovedCheckOptions(options as Record<string, unknown>);
  const source = await normalizeSourceOptions(options);
  const rules = applyCodeDisciplinePresets(options.rules, options.presets);

  return {
    ...source,
    configPath: options.configPath,
    logging: normalizeLoggingOptions(options.logging, "logging"),
    onlyRules: normalizeOnlyRules(mode, options.onlyRules, rules, options.formatters),
    progressObserver: options.progressObserver,
    formatters: normalizeFormatters(options.formatters),
    rules: {
      bannedPatterns: normalizeBannedPatternsRule(rules?.bannedPatterns),
      bannedFiles: normalizeBannedFilesRule(rules?.bannedFiles),
      dry: normalizeDryRule(rules?.dry),
      minFileLines: normalizeMinFileLinesRule(rules?.minFileLines),
      minDeclarationName: normalizeMinDeclarationNameRule(rules?.minDeclarationName),
      maxFileLines: normalizeMaxFileLinesRule(rules?.maxFileLines),
      maxCharactersPerLine: normalizeMaxCharactersPerLineRule(rules?.maxCharactersPerLine),
      maxFunctionLines: normalizeMaxFunctionLinesRule(rules?.maxFunctionLines),
      folderizeCompoundFiles: normalizeFolderizeCompoundFilesRule(rules?.folderizeCompoundFiles),
      syncImports: normalizeSyncImportsRule(rules?.syncImports),
      removeComments: normalizeRemoveCommentsRule(rules?.removeComments),
      structuralBlankLines: normalizeStructuralBlankLinesRule(rules?.structuralBlankLines),
    },
  };
}

export { normalizeCheckCodeDisciplineOptions };
