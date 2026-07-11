import {
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
} from "../../shared/constants.js";
import { InvalidCodeDisciplineConfigError } from "../../shared/errors.js";
import type {
  BannedPatternsRuleOptions,
  CodeDisciplineSyncImportsRuleOptions,
  DryRuleOptions,
  EvasionGuardsOptions,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  NormalizedBannedPatternsRule,
  NormalizedDryRule,
  NormalizedEvasionGuardsOptions,
  RemoveCommentsRuleOptions,
} from "../../checks/types.js";
import { normalizeRelativePath } from "../../shared/utils.js";

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
  value: unknown,
  ruleName: string,
): "warning" | "fail" {
  if (value === undefined) return "fail";
  if (value === "warning" || value === "fail") return value;

  throw new InvalidCodeDisciplineConfigError(`${ruleName}.severity must be "warning" or "fail" when provided`, {
    rule: ruleName,
    value,
  });
}

function normalizeMaxFileLinesRule(rule: MaxFileLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("maxFileLines", source, ["enabled", "stop", "fix"]);

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFileLines.max must be a finite number when the rule is configured", {
      rule: "maxFileLines",
      value: rule?.max,
    });
  }

  return {
    max: Math.max(1, Math.floor(rule!.max as number)),
    severity: normalizeSeverity(rule.severity, "maxFileLines"),
  };
}

function normalizeBannedPatternsRule(rule: BannedPatternsRuleOptions | undefined): NormalizedBannedPatternsRule | undefined {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("bannedPatterns", source, ["enabled", "stop", "fix"]);

  if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
    throw new InvalidCodeDisciplineConfigError("bannedPatterns.patterns must contain at least one pattern", {
      rule: "bannedPatterns",
    });
  }

  const patterns = rule.patterns.map((entry, index) => {
    const value = typeof entry === "string"
      ? entry.trim()
      : typeof entry?.value === "string"
        ? entry.value.trim()
        : "";

    if (!value) {
      throw new InvalidCodeDisciplineConfigError("bannedPatterns.patterns[] entries must be non-empty strings or { value } objects", {
        rule: "bannedPatterns",
        index,
      });
    }

    const allowedFiles = typeof entry === "string"
      ? []
      : uniqueStrings((entry.allowedFiles ?? []).map((filePath) => normalizeRelativePath(String(filePath).trim())).filter(Boolean));

    return {
      value,
      normalizedValue: value.toLowerCase(),
      allowedFiles,
    };
  });

  return {
    patterns,
    severity: normalizeSeverity(rule.severity, "bannedPatterns"),
  };
}

function normalizeMaxFunctionLinesRule(rule: MaxFunctionLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("maxFunctionLines", source, ["enabled", "stop", "fix"]);

  if (!Number.isFinite(rule?.max)) {
    throw new InvalidCodeDisciplineConfigError("maxFunctionLines.max must be a finite number when the rule is configured", {
      rule: "maxFunctionLines",
      value: rule?.max,
    });
  }

  return {
    max: Math.max(1, Math.floor(rule!.max as number)),
    severity: normalizeSeverity(rule.severity, "maxFunctionLines"),
  };
}

function normalizeFolderizeCompoundFilesRule(rule: FolderizeCompoundFilesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("folderizeCompoundFiles", source, ["enabled", "stop", "suffixes", "fix"]);
  const separators = uniqueStrings(rule?.separators ?? DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS);

  if (separators.length === 0) {
    throw new InvalidCodeDisciplineConfigError("folderizeCompoundFiles.separators must contain at least one separator", {
      rule: "folderizeCompoundFiles",
    });
  }

  return {
    separators,
    severity: normalizeSeverity(rule.severity, "folderizeCompoundFiles"),
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

  if ("fix" in source) {
    throw new InvalidCodeDisciplineConfigError("syncImports.fix is no longer supported in discipline config; use the fix command instead", {
      rule: "syncImports",
      key: "fix",
    });
  }

  return {
    sourceRoot: rule?.sourceRoot,
    tsconfigPath: rule?.tsconfigPath,
    excludeSourceExtensions: rule?.excludeSourceExtensions,
    excludeDirs: rule?.excludeDirs,
    gitignorePath: rule?.gitignorePath,
    alias: rule?.alias,
    allowRelative: rule?.allowRelative ?? DEFAULT_ALLOW_RELATIVE,
    packageJsonImports: rule?.packageJsonImports,
    logging: rule?.logging,
    severity: normalizeSeverity(rule.severity, "syncImports"),
  };
}

function normalizeDryRule(rule: DryRuleOptions | undefined): NormalizedDryRule | undefined {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("dry", source, ["enabled", "stop", "fix"]);

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
    severity: normalizeSeverity(rule.severity, "dry"),
  };
}

function normalizeRemoveCommentsRule(rule: RemoveCommentsRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("removeComments", source, ["enabled", "stop", "fix"]);
  const unsupportedKeys = Object.keys(source).filter((key) => key !== "severity" && key !== "exclude");
  if (unsupportedKeys.length > 0) {
    throw new InvalidCodeDisciplineConfigError("removeComments does not accept rule options", {
      rule: "removeComments",
      keys: unsupportedKeys,
    });
  }

  if (rule.exclude !== undefined && !Array.isArray(rule.exclude)) {
    throw new InvalidCodeDisciplineConfigError("removeComments.exclude must be an array of strings when provided", {
      rule: "removeComments",
      value: rule.exclude,
    });
  }

  return {
    severity: normalizeSeverity(rule.severity, "removeComments"),
    exclude: uniqueStrings((rule.exclude ?? []).map((pattern) => String(pattern).trim()).filter(Boolean)),
  };
}

function normalizeThreshold(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;

  if (!Number.isFinite(value)) {
    throw new InvalidCodeDisciplineConfigError(`${label} must be a finite number`, {
      value,
    });
  }

  return Math.max(1, Math.floor(value as number));
}

function normalizeEvasionGuardsOptions(options: EvasionGuardsOptions | undefined): NormalizedEvasionGuardsOptions | undefined {
  if (!options) return undefined;

  const source = typeof options === "object" ? options : {};
  const packedSource = typeof source.packedCode === "object" ? source.packedCode : {};
  const packedCode = source.packedCode === false
    ? undefined
    : {
      minPackedLineColumns: normalizeThreshold(packedSource.minPackedLineColumns, 120, "evasionGuards.packedCode.minPackedLineColumns"),
      maxSemicolonsPerLine: normalizeThreshold(packedSource.maxSemicolonsPerLine, 3, "evasionGuards.packedCode.maxSemicolonsPerLine"),
      maxStructuralTokensPerLine: normalizeThreshold(packedSource.maxStructuralTokensPerLine, 10, "evasionGuards.packedCode.maxStructuralTokensPerLine"),
      maxPackedFunctionLines: normalizeThreshold(packedSource.maxPackedFunctionLines, 2, "evasionGuards.packedCode.maxPackedFunctionLines"),
      maxPackedFunctionStatements: normalizeThreshold(packedSource.maxPackedFunctionStatements, 3, "evasionGuards.packedCode.maxPackedFunctionStatements"),
      minPackedFunctionCharacters: normalizeThreshold(packedSource.minPackedFunctionCharacters, 100, "evasionGuards.packedCode.minPackedFunctionCharacters"),
      maxPackedFileNonEmptyLines: normalizeThreshold(packedSource.maxPackedFileNonEmptyLines, 8, "evasionGuards.packedCode.maxPackedFileNonEmptyLines"),
      minPackedFileCharacters: normalizeThreshold(packedSource.minPackedFileCharacters, 1200, "evasionGuards.packedCode.minPackedFileCharacters"),
      minPackedFileStructuralTokens: normalizeThreshold(packedSource.minPackedFileStructuralTokens, 25, "evasionGuards.packedCode.minPackedFileStructuralTokens"),
    };

  return {
    packedCode,
    runtimeCodeHiding: source.runtimeCodeHiding ?? true,
    severity: normalizeSeverity(source.severity, "evasionGuards"),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

export {
  normalizeBannedPatternsRule,
  normalizeDryRule,
  normalizeEvasionGuardsOptions,
  normalizeFolderizeCompoundFilesRule,
  normalizeMaxFileLinesRule,
  normalizeMaxFunctionLinesRule,
  normalizeRemoveCommentsRule,
  normalizeSyncImportsRule,
};
