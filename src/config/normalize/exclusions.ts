import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import type { ExcludeDirEntry, ExcludeDirEntryType } from "#pkb9x3eo56l7";

function assertRemovedExclusionKeys(source: Record<string, unknown>, label: string): void {
  for (const key of ["excludeFiles", "excludeFolders"] as const) {
    if (key in source) {
      throw new InvalidCodeDisciplineConfigError(`${label}.${key} is no longer supported; use ${label}.excludeDirs entries with type "file" or "folder"`, {
        key,
      });
    }
  }
}

function normalizeExclusionType(value: unknown, label: string): ExcludeDirEntryType {
  if (value === "file" || value === "folder") return value;

  throw new InvalidCodeDisciplineConfigError(`${label}.type must be "file" or "folder"`, {
    value,
  });
}

function normalizeExcludeDirEntries(value: unknown, label: string): ExcludeDirEntry[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new InvalidCodeDisciplineConfigError(`${label} must be an array of exclusion entries when provided`, {
      value,
    });
  }

  const entries = value.map((entry, index): ExcludeDirEntry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new InvalidCodeDisciplineConfigError(`${label}[] entries must be objects with type and pattern`, {
        index,
        value: entry,
      });
    }

    const source = entry as Record<string, unknown>;
    const type = normalizeExclusionType(source.type, `${label}[${index}]`);
    const pattern = normalizeRelativePath(String(source.pattern ?? "").trim()).replace(/\/+$/g, "");

    if (!pattern) {
      throw new InvalidCodeDisciplineConfigError(`${label}[${index}].pattern must be a non-empty string`, {
        index,
        value: source.pattern,
      });
    }

    return { type, pattern };
  });

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.type}:${entry.pattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRuleExclusions(ruleName: string, source: Record<string, unknown>) {
  assertRemovedExclusionKeys(source, ruleName);

  return {
    excludeDirs: normalizeExcludeDirEntries(source.excludeDirs, `${ruleName}.excludeDirs`),
  };
}

function normalizeFolderExclusionEntries(patterns: string[]): ExcludeDirEntry[] {
  return uniqueStrings(patterns.map((pattern) => normalizeRelativePath(pattern).replace(/\/+$/g, "")).filter(Boolean))
    .map((pattern) => ({ type: "folder", pattern }));
}

function normalizeFileExclusionEntries(patterns: string[]): ExcludeDirEntry[] {
  return uniqueStrings(patterns.map((pattern) => normalizeRelativePath(pattern).replace(/\/+$/g, "")).filter(Boolean))
    .map((pattern) => ({ type: "file", pattern }));
}

function mergeExcludeDirEntries(...groups: ExcludeDirEntry[][]): ExcludeDirEntry[] {
  const seen = new Set<string>();
  return groups.flat().filter((entry) => {
    const key = `${entry.type}:${entry.pattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export {
  assertRemovedExclusionKeys,
  mergeExcludeDirEntries,
  normalizeExcludeDirEntries,
  normalizeFileExclusionEntries,
  normalizeFolderExclusionEntries,
  normalizeRuleExclusions,
};
