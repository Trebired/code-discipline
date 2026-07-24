import { InvalidCodeDisciplineConfigError } from "../../shared/errors.js";
import { normalizeRelativePath, uniqueStrings } from "../../shared/utils.js";

function normalizeRuleExclusionList(value: unknown, label: string): string[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new InvalidCodeDisciplineConfigError(`${label} must be an array of strings when provided`, {
      value,
    });
  }

  return uniqueStrings(value.map((entry) => normalizeRelativePath(String(entry).trim())).filter(Boolean));
}

function normalizeRuleExclusions(ruleName: string, source: Record<string, unknown>) {
  return {
    excludeFiles: normalizeRuleExclusionList(source.excludeFiles, `${ruleName}.excludeFiles`),
    excludeFolders: normalizeRuleExclusionList(source.excludeFolders, `${ruleName}.excludeFolders`)
      .map((folder) => folder.replace(/\/+$/g, ""))
      .filter(Boolean),
  };
}

export { normalizeRuleExclusionList, normalizeRuleExclusions };
