import type {
  CheckCodeDisciplineOptions,
  CodeDisciplineMode,
  CodeDisciplineRules,
  FixCodeDisciplineOptions,
  NormalizedCheckCodeDisciplineOptions,
} from "#uqbg4indzud7";
import { normalizeOnlyRules } from "#ydyygm5y7vgb";
import {
  normalizeBannedPatternsRule,
  normalizeBannedFilesRule,
  normalizeDryRule,
  normalizeSourceFileStructureRule,
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
    throw new InvalidCodeDisciplineConfigError("formatters is no longer supported; use rules.formatting instead", {
      key: "formatters",
    });
  }

  if ("formatter" in options) {
    throw new InvalidCodeDisciplineConfigError("formatter is no longer supported; use rules.formatting instead", {
      key: "formatter",
    });
  }
}

function assertRemovedRuleKeys(rules: CodeDisciplineRules | undefined): void {
  const source = rules as Record<string, unknown> | undefined;
  if (!source) return;

  if ("folderizeCompoundFiles" in source) {
    throw new InvalidCodeDisciplineConfigError("rules.folderizeCompoundFiles is no longer supported; use rules.sourceFileStructure instead", {
      key: "rules.folderizeCompoundFiles",
    });
  }
}

async function normalizeCheckCodeDisciplineOptions(
  options: CheckCodeDisciplineOptions | FixCodeDisciplineOptions,
  mode: CodeDisciplineMode,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  assertRemovedCheckOptions(options as Record<string, unknown>);
  const source = await normalizeSourceOptions(options);
  assertRemovedRuleKeys(options.rules);
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
    sourceFileStructure: normalizeSourceFileStructureRule(rules?.sourceFileStructure),
    imports: normalizeImportsRule(rules?.imports),
    removeComments: normalizeRemoveCommentsRule(rules?.removeComments),
    structuralBlankLines: normalizeStructuralBlankLinesRule(rules?.structuralBlankLines),
  };
  const formatting = normalizeFormatter(rules?.formatting, {
    maxCharactersPerLine: normalizedRules.maxCharactersPerLine?.max,
  });

  return {
    ...source,
    configPath: options.configPath,
    logging: normalizeLoggingOptions(options.logging, "logging"),
    onlyRules: normalizeOnlyRules(mode, options.onlyRules, rules),
    progressObserver: options.progressObserver,
    rules: {
      ...normalizedRules,
      formatting,
    },
  };
}

export { normalizeCheckCodeDisciplineOptions };
