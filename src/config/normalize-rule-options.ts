import {
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
} from "../shared/constants.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import type {
  CodeDisciplineSyncImportsRuleOptions,
  DryRuleOptions,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  NormalizedDryRule,
} from "../checks/types.js";

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

function assertSeverityRemoved(ruleName: string, rule: Record<string, unknown>) {
  if ("severity" in rule) {
    throw new InvalidCodeDisciplineConfigError(`${ruleName}.severity is no longer supported`, {
      rule: ruleName,
      key: "severity",
    });
  }
}

function normalizeMaxFileLinesRule(rule: MaxFileLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("maxFileLines", source, ["enabled", "stop", "fix"]);
  assertSeverityRemoved("maxFileLines", source);

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFileLines.max must be a finite number when the rule is configured", {
      rule: "maxFileLines",
      value: rule?.max,
    });
  }

  return {
    max: Math.max(1, Math.floor(rule!.max as number)),
  };
}

function normalizeMaxFunctionLinesRule(rule: MaxFunctionLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("maxFunctionLines", source, ["enabled", "stop", "fix"]);
  assertSeverityRemoved("maxFunctionLines", source);

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFunctionLines.max must be a finite number when the rule is configured", {
      rule: "maxFunctionLines",
      value: rule?.max,
    });
  }

  return {
    max: Math.max(1, Math.floor(rule!.max as number)),
  };
}

function normalizeFolderizeCompoundFilesRule(rule: FolderizeCompoundFilesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("folderizeCompoundFiles", source, ["enabled", "stop", "suffixes", "fix"]);
  assertSeverityRemoved("folderizeCompoundFiles", source);
  const separators = uniqueStrings(rule?.separators ?? DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS);

  if (separators.length === 0) {
    throw new InvalidCodeDisciplineConfigError("folderizeCompoundFiles.separators must contain at least one separator", {
      rule: "folderizeCompoundFiles",
    });
  }

  return {
    separators,
  };
}

function normalizeSyncImportsRule(rule: CodeDisciplineSyncImportsRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = (rule ?? {}) as Record<string, unknown>;
  assertRemovedKeys("syncImports", source, ["enabled", "stop", "rewrite", "keepRelative"]);
  assertSeverityRemoved("syncImports", source);

  if ("imports" in source) {
    throw new InvalidCodeDisciplineConfigError("syncImports.imports is no longer supported; use allowRelative directly under syncImports", {
      rule: "syncImports",
      key: "imports",
    });
  }

  if ("fix" in source) {
    throw new InvalidCodeDisciplineConfigError("syncImports.fix is no longer supported in discipline config; use the fix command instead", {
      rule: "syncImports",
      key: "fix",
    });
  }

  return {
    sourceRoot: rule?.sourceRoot,
    tsconfigPath: rule?.tsconfigPath,
    sourceExtensions: rule?.sourceExtensions,
    includeDefaultSourceExtensions: rule?.includeDefaultSourceExtensions,
    excludeDirs: rule?.excludeDirs,
    gitignorePath: rule?.gitignorePath,
    alias: rule?.alias,
    allowRelative: rule?.allowRelative ?? DEFAULT_ALLOW_RELATIVE,
    packageJsonImports: rule?.packageJsonImports,
    logging: rule?.logging,
  };
}

function normalizeDryRule(rule: DryRuleOptions | undefined): NormalizedDryRule | undefined {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("dry", source, ["enabled", "stop", "fix"]);
  assertSeverityRemoved("dry", source);

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
    helpers,
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export { normalizeDryRule, normalizeFolderizeCompoundFilesRule, normalizeMaxFileLinesRule, normalizeMaxFunctionLinesRule, normalizeSyncImportsRule };
