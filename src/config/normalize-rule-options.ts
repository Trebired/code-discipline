import {
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
  DEFAULT_RULE_FIX,
  DEFAULT_RULE_SEVERITY,
} from "../shared/constants.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import type {
  CodeDisciplineSyncImportsRuleOptions,
  DryRuleOptions,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  NormalizedDryRule,
  SeverityRuleOptions,
} from "../checks/types.js";
import type { CodeDisciplineSeverity } from "../shared/discipline-types.js";

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

function normalizeSeverity(
  ruleName: string,
  rule: SeverityRuleOptions | undefined,
): CodeDisciplineSeverity {
  const severity = rule?.severity ?? DEFAULT_RULE_SEVERITY;
  if (severity !== "error" && severity !== "warning") {
    throw new InvalidCodeDisciplineConfigError(`${ruleName}.severity must be "error" or "warning"`, {
      rule: ruleName,
      value: severity,
    });
  }

  return severity;
}

function normalizeMaxFileLinesRule(rule: MaxFileLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  assertRemovedKeys("maxFileLines", rule as Record<string, unknown>, ["enabled", "stop", "fix"]);

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFileLines.max must be a finite number when the rule is configured", {
      rule: "maxFileLines",
      value: rule?.max,
    });
  }

  return {
    severity: normalizeSeverity("maxFileLines", rule),
    max: Math.max(1, Math.floor(rule!.max as number)),
  };
}

function normalizeMaxFunctionLinesRule(rule: MaxFunctionLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  assertRemovedKeys("maxFunctionLines", rule as Record<string, unknown>, ["enabled", "stop", "fix"]);

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFunctionLines.max must be a finite number when the rule is configured", {
      rule: "maxFunctionLines",
      value: rule?.max,
    });
  }

  return {
    severity: normalizeSeverity("maxFunctionLines", rule),
    max: Math.max(1, Math.floor(rule!.max as number)),
  };
}

function normalizeFolderizeCompoundFilesRule(rule: FolderizeCompoundFilesRuleOptions | undefined) {
  if (!rule) return undefined;
  assertRemovedKeys("folderizeCompoundFiles", rule as Record<string, unknown>, ["enabled", "stop", "suffixes"]);
  const separators = uniqueStrings(rule?.separators ?? DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS);

  if (separators.length === 0) {
    throw new InvalidCodeDisciplineConfigError("folderizeCompoundFiles.separators must contain at least one separator", {
      rule: "folderizeCompoundFiles",
    });
  }

  return {
    severity: normalizeSeverity("folderizeCompoundFiles", rule),
    fix: Boolean(rule.fix ?? DEFAULT_RULE_FIX),
    separators,
  };
}

function normalizeSyncImportsRule(rule: CodeDisciplineSyncImportsRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = (rule ?? {}) as Record<string, unknown>;
  assertRemovedKeys("syncImports", source, ["enabled", "stop", "rewrite", "keepRelative"]);

  if ("imports" in source) {
    throw new InvalidCodeDisciplineConfigError("syncImports.imports is no longer supported; use allowRelative directly under syncImports", {
      rule: "syncImports",
      key: "imports",
    });
  }

  return {
    severity: normalizeSeverity("syncImports", rule),
    fix: Boolean(rule?.fix ?? DEFAULT_RULE_FIX),
    sourceRoot: rule?.sourceRoot,
    tsconfigPath: rule?.tsconfigPath,
    sourceExtensions: rule?.sourceExtensions,
    excludeDirs: rule?.excludeDirs,
    alias: rule?.alias,
    allowRelative: rule?.allowRelative ?? DEFAULT_ALLOW_RELATIVE,
    packageJsonImports: rule?.packageJsonImports,
    logging: rule?.logging,
  };
}

function normalizeDryRule(rule: DryRuleOptions | undefined): NormalizedDryRule | undefined {
  if (!rule) return undefined;
  assertRemovedKeys("dry", rule as Record<string, unknown>, ["enabled", "stop"]);

  if (!Array.isArray(rule.helpers) || rule.helpers.length === 0) {
    throw new InvalidCodeDisciplineConfigError("dry.helpers must contain at least one helper", {
      rule: "dry",
    });
  }

  const helpers = rule.helpers.map((helper, index) => {
    const from = String(helper?.from ?? "").trim();
    const exportName = String(helper?.exportName ?? "").trim();

    if (!from) {
      throw new InvalidCodeDisciplineConfigError("dry.helpers[].from must be a non-empty string", {
        rule: "dry",
        index,
      });
    }

    if (!exportName) {
      throw new InvalidCodeDisciplineConfigError("dry.helpers[].exportName must be a non-empty string", {
        rule: "dry",
        index,
      });
    }

    return {
      from,
      exportName,
      key: helper?.key ? String(helper.key).trim() : undefined,
    };
  });

  return {
    severity: normalizeSeverity("dry", rule),
    fix: Boolean(rule.fix ?? DEFAULT_RULE_FIX),
    helpers,
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export { normalizeDryRule, normalizeFolderizeCompoundFilesRule, normalizeMaxFileLinesRule, normalizeMaxFunctionLinesRule, normalizeSyncImportsRule };
