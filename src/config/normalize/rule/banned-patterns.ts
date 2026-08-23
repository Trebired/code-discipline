import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import { normalizeRuleExclusions } from "#gqxxrd6ye9fj";
import { normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import { CODE_DISCIPLINE_CONFIG_FILE } from "#ik5y0pee4ah1";
import { assertRemovedKeys, normalizeSeverity } from "./validation.js";
import type { BannedPatternsRuleOptions, NormalizedBannedPatternsRule } from "#uqbg4indzud7";

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
  const exclusions = normalizeRuleExclusions("bannedPatterns", source);
  return {
    ...exclusions,
    excludeDirs: [
      ...(exclusions.excludeDirs ?? []),
      { type: "file"as const, pattern: CODE_DISCIPLINE_CONFIG_FILE },
    ],
    patterns,
    severity: normalizeSeverity(rule.severity, "bannedPatterns"),
  };
}

export { normalizeBannedPatternsRule };
