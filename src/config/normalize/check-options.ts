import type {
  CheckCodeDisciplineOptions,
  CodeDisciplineMode,
  CodeDisciplineRules,
  FixCodeDisciplineOptions,
  NormalizedCheckCodeDisciplineOptions,
} from "#uqbg4indzud7";
import { normalizeOnlyRules } from "#ydyygm5y7vgb";
import { normalizeFormatter } from "./formatter-options.js";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { normalizeLoggingOptions } from "./logging-options.js";
import { applyPresets } from "./presets.js";
import {
  normalizeBannedFilesRule,
  normalizeBannedPatternsRule,
  normalizeDryRule,
  normalizeImportsRule,
  normalizeMaxCharactersPerLineRule,
  normalizeMaxDeclarationNameRule,
  normalizeMaxFileLinesRule,
  normalizeMaxFunctionLinesRule,
  normalizeMinDeclarationNameRule,
  normalizeMinFileLinesRule,
  normalizeRedundantPathSegmentsRule,
  normalizeRemoveEmptyFoldersRule,
  normalizeRemoveCommentsRule,
  normalizeStructuralBlankLinesRule,
} from "./rule/options.js";
import { normalizeSourceOptions } from "./source-options.js";

function assertRemovedCheckOptions(options: Record<string, unknown>): void {
  if ("evasionGuards"in options) {
    throw new InvalidCodeDisciplineConfigError("evasionGuards is no longer supported; use rules.maxCharactersPerLine instead", {
        key: "evasionGuards",
    });
  }

  if ("tsconfigPaths"in options) {
    throw new InvalidCodeDisciplineConfigError("tsconfigPaths is no longer supported; use rules.imports.runtime instead", {
        key: "tsconfigPaths",
    });
  }

  if ("formatters"in options) {
    throw new InvalidCodeDisciplineConfigError("formatters is no longer supported; use rules.formatting instead", {
        key: "formatters",
    });
  }

  if ("formatter"in options) {
    throw new InvalidCodeDisciplineConfigError("formatter is no longer supported; use rules.formatting instead", {
        key: "formatter",
    });
  }
}

function assertRemovedRuleKeys(rules: CodeDisciplineRules | undefined): void {
  const source = rules as Record<string, unknown>|undefined;
  if (!source) return;

  if ("folderizeCompoundFiles"in source) {
    throw new InvalidCodeDisciplineConfigError("rules.folderizeCompoundFiles is no longer supported; use rules.redundantPathSegments instead", {
        key: "rules.folderizeCompoundFiles",
    });
  }

  if ("sourceFileStructure"in source) {
    throw new InvalidCodeDisciplineConfigError("rules.sourceFileStructure is no longer supported; use rules.redundantPathSegments instead", {
        key: "rules.sourceFileStructure",
    });
  }

  if ("emptyFolders"in source) {
    throw new InvalidCodeDisciplineConfigError("rules.emptyFolders is no longer supported; use rules.removeEmptyFolders instead", {
        key: "rules.emptyFolders",
    });
  }
}

async function normalizeCheckOptions(
  options: CheckCodeDisciplineOptions | FixCodeDisciplineOptions,
  mode: CodeDisciplineMode,
): Promise<NormalizedCheckCodeDisciplineOptions> {
  assertRemovedCheckOptions(options as Record<string, unknown>);
  const presetOptions = await applyPresets(options, {
      projectRoot: options.projectRoot,
  });
  const source = await normalizeSourceOptions(presetOptions);
  assertRemovedRuleKeys(presetOptions.rules);
  const rules = presetOptions.rules;
  const normalizedRules = {
    bannedPatterns: normalizeBannedPatternsRule(rules?.bannedPatterns),
    bannedFiles: normalizeBannedFilesRule(rules?.bannedFiles),
    dry: normalizeDryRule(rules?.dry),
    minFileLines: normalizeMinFileLinesRule(rules?.minFileLines),
    minDeclarationName: normalizeMinDeclarationNameRule(rules?.minDeclarationName),
    maxDeclarationName: normalizeMaxDeclarationNameRule(rules?.maxDeclarationName),
    maxFileLines: normalizeMaxFileLinesRule(rules?.maxFileLines),
    maxCharactersPerLine: normalizeMaxCharactersPerLineRule(rules?.maxCharactersPerLine),
    maxFunctionLines: normalizeMaxFunctionLinesRule(rules?.maxFunctionLines),
    redundantPathSegments: normalizeRedundantPathSegmentsRule(rules?.redundantPathSegments),
    removeEmptyFolders: normalizeRemoveEmptyFoldersRule(rules?.removeEmptyFolders),
    imports: normalizeImportsRule(rules?.imports),
    removeComments: normalizeRemoveCommentsRule(rules?.removeComments),
    structuralBlankLines: normalizeStructuralBlankLinesRule(rules?.structuralBlankLines),
  };
  const formatting = normalizeFormatter(rules?.formatting, {
      maxCharactersPerLine: normalizedRules.maxCharactersPerLine?.max,
  });

  return {
    ...source,
    configPath: presetOptions.configPath,
    logging: normalizeLoggingOptions(presetOptions.logging, "logging"),
    onlyRules: normalizeOnlyRules(mode, presetOptions.onlyRules, rules),
    progressObserver: presetOptions.progressObserver,
    rules: {
      ...normalizedRules,
      formatting,
    },
  };
}

export { normalizeCheckOptions };
