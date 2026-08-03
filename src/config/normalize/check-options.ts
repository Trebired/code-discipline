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
  normalizeImportsRule,
} from "./rule-options.js";
import { normalizeFormatter } from "./formatter-options.js";
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
    throw new InvalidCodeDisciplineConfigError("tsconfigPaths is no longer supported; use rules.imports.runtime instead", {
      key: "tsconfigPaths",
    });
  }

  if ("formatters" in options) {
    throw new InvalidCodeDisciplineConfigError("formatters is no longer supported; use formatter: true or formatter: false", {
      key: "formatters",
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
  const normalizedRules = {
    bannedPatterns: normalizeBannedPatternsRule(rules?.bannedPatterns),
    bannedFiles: normalizeBannedFilesRule(rules?.bannedFiles),
    dry: normalizeDryRule(rules?.dry),
    minFileLines: normalizeMinFileLinesRule(rules?.minFileLines),
    minDeclarationName: normalizeMinDeclarationNameRule(rules?.minDeclarationName),
    maxFileLines: normalizeMaxFileLinesRule(rules?.maxFileLines),
    maxCharactersPerLine: normalizeMaxCharactersPerLineRule(rules?.maxCharactersPerLine),
    maxFunctionLines: normalizeMaxFunctionLinesRule(rules?.maxFunctionLines),
    folderizeCompoundFiles: normalizeFolderizeCompoundFilesRule(rules?.folderizeCompoundFiles),
    imports: normalizeImportsRule(rules?.imports),
    removeComments: normalizeRemoveCommentsRule(rules?.removeComments),
    structuralBlankLines: normalizeStructuralBlankLinesRule(rules?.structuralBlankLines),
  };

  return {
    ...source,
    configPath: options.configPath,
    logging: normalizeLoggingOptions(options.logging, "logging"),
    onlyRules: normalizeOnlyRules(mode, options.onlyRules, rules, options.formatter),
    progressObserver: options.progressObserver,
    formatter: normalizeFormatter(options.formatter, {
      maxCharactersPerLine: normalizedRules.maxCharactersPerLine?.max,
    }),
    rules: normalizedRules,
  };
}

export { normalizeCheckCodeDisciplineOptions };
