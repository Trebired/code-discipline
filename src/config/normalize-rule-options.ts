import {
  DEFAULT_FOLDERIZE_COMPOUND_FILES_SEVERITY,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SUFFIXES,
  DEFAULT_MAX_FILE_LINES_SEVERITY,
} from "../shared/constants.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import type {
  CodeDisciplineRuleSeverity,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
} from "../checks/types.js";

function normalizeSeverity(value: CodeDisciplineRuleSeverity | undefined): CodeDisciplineRuleSeverity {
  return value === "warn" ? "warn" : "error";
}

function normalizeMaxFileLinesRule(rule: MaxFileLinesRuleOptions | undefined) {
  const enabled = rule?.enabled ?? false;

  if (!enabled) {
    return {
      enabled: false,
      max: 0,
      severity: normalizeSeverity(rule?.severity ?? DEFAULT_MAX_FILE_LINES_SEVERITY),
    };
  }

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFileLines.max must be a finite number when the rule is enabled", {
      rule: "maxFileLines",
      value: rule?.max,
    });
  }

  return {
    enabled: true,
    max: Math.max(1, Math.floor(rule!.max as number)),
    severity: normalizeSeverity(rule?.severity ?? DEFAULT_MAX_FILE_LINES_SEVERITY),
  };
}

function normalizeFolderizeCompoundFilesRule(rule: FolderizeCompoundFilesRuleOptions | undefined) {
  const separators = uniqueStrings(rule?.separators ?? DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS);
  const suffixes = uniqueStrings(rule?.suffixes ?? DEFAULT_FOLDERIZE_COMPOUND_FILE_SUFFIXES);

  if (separators.length === 0) {
    throw new InvalidCodeDisciplineConfigError("folderizeCompoundFiles.separators must contain at least one separator", {
      rule: "folderizeCompoundFiles",
    });
  }

  if (suffixes.length === 0) {
    throw new InvalidCodeDisciplineConfigError("folderizeCompoundFiles.suffixes must contain at least one suffix", {
      rule: "folderizeCompoundFiles",
    });
  }

  return {
    enabled: rule?.enabled ?? false,
    separators,
    suffixes,
    severity: normalizeSeverity(rule?.severity ?? DEFAULT_FOLDERIZE_COMPOUND_FILES_SEVERITY),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export { normalizeFolderizeCompoundFilesRule, normalizeMaxFileLinesRule };
