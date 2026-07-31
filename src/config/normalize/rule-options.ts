import {
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
} from "#ik5y0pee4ah1";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type {
  BannedPatternsRuleOptions,
  BannedFilesRuleOptions,
  CodeDisciplineImportsRuleOptions,
  DryRuleOptions,
  FolderizeCompoundFilesRuleOptions,
  MaxCharactersPerLineRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  MinDeclarationNameRuleOptions,
  MinFileLinesRuleOptions,
  NormalizedBannedPatternsRule,
  NormalizedBannedFilesRule,
  NormalizedDryRule,
  RemoveCommentsRuleOptions,
  StructuralBlankLinesRuleOptions,
} from "#uqbg4indzud7";
import { normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import { normalizeRuleExclusions } from "./exclusions.js";
import { normalizeLoggingOptions } from "./logging-options.js";
const DEFAULT_MIN_FILE_LINES = 1;
const DEFAULT_MIN_DECLARATION_NAME = 2;
const DEFAULT_MAX_CHARACTERS_PER_LINE = 150;
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
function normalizeMinDuplicateCharacters(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidCodeDisciplineConfigError("dry.minDuplicateCharacters must be a finite number when provided", {
      rule: "dry",
      value,
    });
  }
  return Math.max(0, Math.floor(value as number));
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
function normalizeMinFileLinesRule(rule: MinFileLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("minFileLines", source, ["enabled", "stop", "fix"]);
  return {
    ...normalizeRuleExclusions("minFileLines", source),
    min: normalizeThreshold(rule.min, DEFAULT_MIN_FILE_LINES, "minFileLines.min"),
    severity: normalizeSeverity(rule.severity, "minFileLines"),
  };
}
function normalizeMinDeclarationNameRule(rule: MinDeclarationNameRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("minDeclarationName", source, ["enabled", "stop", "fix"]);
  return {
    ...normalizeRuleExclusions("minDeclarationName", source),
    min: normalizeThreshold(rule.min, DEFAULT_MIN_DECLARATION_NAME, "minDeclarationName.min"),
    severity: normalizeSeverity(rule.severity, "minDeclarationName"),
  };
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
    ...normalizeRuleExclusions("maxFileLines", source),
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
    ...normalizeRuleExclusions("bannedPatterns", source),
    patterns,
    severity: normalizeSeverity(rule.severity, "bannedPatterns"),
  };
}
function normalizeBannedFilesRule(rule: BannedFilesRuleOptions | undefined): NormalizedBannedFilesRule | undefined {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("bannedFiles", source, ["enabled", "stop", "fix"]);
  if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
    throw new InvalidCodeDisciplineConfigError("bannedFiles.patterns must contain at least one pattern", {
      rule: "bannedFiles",
    });
  }
  const patterns = rule.patterns.map((entry, index) => {
    const glob = typeof entry === "string"
      ? entry.trim()
      : typeof entry?.glob === "string"
        ? entry.glob.trim()
        : "";
    if (!glob) {
      throw new InvalidCodeDisciplineConfigError("bannedFiles.patterns[] entries must be non-empty strings or { glob } objects", {
        rule: "bannedFiles",
        index,
      });
    }
    return {
      glob: normalizeRelativePath(glob),
    };
  });
  return {
    ...normalizeRuleExclusions("bannedFiles", source),
    patterns,
    severity: normalizeSeverity(rule.severity, "bannedFiles"),
  };
}
function normalizeMaxCharactersPerLineRule(rule: MaxCharactersPerLineRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("maxCharactersPerLine", source, ["enabled", "stop", "fix"]);
  return {
    ...normalizeRuleExclusions("maxCharactersPerLine", source),
    max: normalizeThreshold(rule.max, DEFAULT_MAX_CHARACTERS_PER_LINE, "maxCharactersPerLine.max"),
    severity: normalizeSeverity(rule.severity, "maxCharactersPerLine"),
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
    ...normalizeRuleExclusions("maxFunctionLines", source),
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
    ...normalizeRuleExclusions("folderizeCompoundFiles", source),
    separators,
    severity: normalizeSeverity(rule.severity, "folderizeCompoundFiles"),
  };
}
function normalizeImportsOutput(output: CodeDisciplineImportsRuleOptions["output"]): CodeDisciplineImportsRuleOptions["output"] {
  if (output === undefined) return undefined;
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new InvalidCodeDisciplineConfigError("imports.output must be an object when provided", {
      rule: "imports",
      key: "output",
      value: output,
    });
  }
  const type = (output as { type?: unknown }).type;
  if (type === undefined || type === "project-manifests") {
    return { type: "project-manifests" };
  }
  if (type === "alias-map") {
    return {
      type: "alias-map",
      maxEntriesPerFile: (output as { maxEntriesPerFile?: number }).maxEntriesPerFile,
    };
  }
  throw new InvalidCodeDisciplineConfigError('imports.output.type must be "project-manifests" or "alias-map"', {
    rule: "imports",
    key: "output.type",
    value: type,
  });
}
function normalizeImportsRule(rule: CodeDisciplineImportsRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = (rule ?? {}) as Record<string, unknown>;
  assertRemovedKeys("imports", source, [
    "enabled",
    "stop",
    "rewrite",
    "keepRelative",
    "sourceRoot",
    "tsconfigPath",
    "importsFolder",
    "generatedTsconfig",
    "packageJsonImports",
  ]);
  if ("imports" in source) {
    throw new InvalidCodeDisciplineConfigError("imports.imports is no longer supported; use allowRelative directly under imports", {
      rule: "imports",
      key: "imports",
    });
  }
  if ("fix" in source) {
    throw new InvalidCodeDisciplineConfigError("imports.fix is no longer supported in discipline config; use the fix command instead", {
      rule: "imports",
      key: "fix",
    });
  }
  return {
    excludeSourceExtensions: rule?.excludeSourceExtensions,
    gitignorePath: rule?.gitignorePath,
    alias: rule?.alias,
    allowRelative: rule?.allowRelative ?? DEFAULT_ALLOW_RELATIVE,
    ...normalizeRuleExclusions("imports", source),
    output: normalizeImportsOutput(rule.output),
    runtime: rule.runtime,
    removeDeadImports: rule.removeDeadImports,
    logging: normalizeLoggingOptions(rule?.logging, "imports.logging"),
    severity: normalizeSeverity(rule.severity, "imports"),
  };
}
function normalizeDryRule(rule: DryRuleOptions | undefined): NormalizedDryRule | undefined {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("dry", source, ["enabled", "stop", "fix", "helpers"]);
  return {
    ...normalizeRuleExclusions("dry", source),
    minDuplicateCharacters: normalizeMinDuplicateCharacters(rule.minDuplicateCharacters),
    severity: normalizeSeverity(rule.severity, "dry"),
  };
}
function normalizeStructuralBlankLinesRule(rule: StructuralBlankLinesRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("structuralBlankLines", source, ["enabled", "stop", "fix"]);
  const unsupportedKeys = Object.keys(source).filter((key) => !["severity", "excludeDirs", "excludeFiles", "excludeFolders"].includes(key));
  if (unsupportedKeys.length > 0) {
    throw new InvalidCodeDisciplineConfigError("structuralBlankLines does not accept rule options", {
      rule: "structuralBlankLines",
      keys: unsupportedKeys,
    });
  }
  return {
    ...normalizeRuleExclusions("structuralBlankLines", source),
    severity: normalizeSeverity(rule.severity, "structuralBlankLines"),
  };
}
function normalizeRemoveCommentsRule(rule: RemoveCommentsRuleOptions | undefined) {
  if (!rule) return undefined;
  const source = rule as Record<string, unknown>;
  assertRemovedKeys("removeComments", source, ["enabled", "stop", "fix"]);
  const unsupportedKeys = Object.keys(source).filter((key) => !["severity", "exclude", "excludeDirs", "excludeFiles", "excludeFolders"].includes(key));
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
    ...normalizeRuleExclusions("removeComments", source),
    severity: normalizeSeverity(rule.severity, "removeComments"),
    exclude: uniqueStrings((rule.exclude ?? []).map((pattern) => String(pattern).trim()).filter(Boolean)),
  };
}
export {
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
};
