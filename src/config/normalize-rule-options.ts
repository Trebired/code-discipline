import {
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
  DEFAULT_RULE_FIX,
  DEFAULT_RULE_STOP,
} from "../shared/constants.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import type {
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  NormalizedRuleControl,
} from "../checks/types.js";
import type { SyncImportsRuleOptions } from "../imports/types.js";

function assertRemovedKeys(ruleName: string, source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in source) {
      throw new InvalidCodeDisciplineConfigError(`${ruleName}.${key} is no longer supported`, {
        rule: ruleName,
        key,
      });
    }
  }
}

function normalizeRuleControl(rule: Record<string, unknown> | undefined): NormalizedRuleControl {
  return {
    enabled: Boolean(rule?.enabled ?? false),
    stop: Boolean(rule?.stop ?? DEFAULT_RULE_STOP),
    fix: Boolean(rule?.fix ?? DEFAULT_RULE_FIX),
  };
}

function normalizeMaxFileLinesRule(rule: MaxFileLinesRuleOptions | undefined) {
  const control = normalizeRuleControl(rule as Record<string, unknown> | undefined);
  assertRemovedKeys("maxFileLines", (rule ?? {}) as Record<string, unknown>, ["severity"]);

  if (!control.enabled) {
    return {
      ...control,
      max: 0,
    };
  }

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFileLines.max must be a finite number when the rule is enabled", {
      rule: "maxFileLines",
      value: rule?.max,
    });
  }

  return {
    ...control,
    max: Math.max(1, Math.floor(rule!.max as number)),
  };
}

function normalizeFolderizeCompoundFilesRule(rule: FolderizeCompoundFilesRuleOptions | undefined) {
  const control = normalizeRuleControl(rule as Record<string, unknown> | undefined);
  assertRemovedKeys("folderizeCompoundFiles", (rule ?? {}) as Record<string, unknown>, ["severity", "suffixes"]);
  const separators = uniqueStrings(rule?.separators ?? DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS);

  if (separators.length === 0) {
    throw new InvalidCodeDisciplineConfigError("folderizeCompoundFiles.separators must contain at least one separator", {
      rule: "folderizeCompoundFiles",
    });
  }

  return {
    ...control,
    separators,
  };
}

function normalizeSyncImportsRule(rule: SyncImportsRuleOptions | undefined) {
  const source = (rule ?? {}) as Record<string, unknown>;
  assertRemovedKeys("syncImports", source, ["severity", "rewrite", "keepRelative"]);

  if ("imports" in source) {
    throw new InvalidCodeDisciplineConfigError("syncImports.imports is no longer supported; use allowRelative directly under syncImports", {
      rule: "syncImports",
      key: "imports",
    });
  }

  return {
    enabled: Boolean(rule?.enabled ?? false),
    stop: Boolean(rule?.stop ?? DEFAULT_RULE_STOP),
    fix: Boolean(rule?.fix ?? DEFAULT_RULE_FIX),
    tsconfigPath: rule?.tsconfigPath,
    alias: rule?.alias,
    allowRelative: rule?.allowRelative ?? DEFAULT_ALLOW_RELATIVE,
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export { normalizeFolderizeCompoundFilesRule, normalizeMaxFileLinesRule, normalizeSyncImportsRule };
