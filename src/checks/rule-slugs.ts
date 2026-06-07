import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import type {
  CodeDisciplineMode,
  CodeDisciplineRuleSlug,
  CodeDisciplineRules,
  FixableRuleSlug,
} from "./types.js";

const ALL_RULE_SLUGS: CodeDisciplineRuleSlug[] = [
  "max-file-lines",
  "max-function-lines",
  "folderize-compound-files",
  "sync-imports",
  "dry",
];

const FIXABLE_RULE_SLUGS: FixableRuleSlug[] = [
  "folderize-compound-files",
  "sync-imports",
  "dry",
];

const RULE_SLUG_BY_CONFIG_KEY = {
  dry: "dry",
  folderizeCompoundFiles: "folderize-compound-files",
  maxFileLines: "max-file-lines",
  maxFunctionLines: "max-function-lines",
  syncImports: "sync-imports",
} as const;

function resolveEnabledRuleSlugs(rules: CodeDisciplineRules | undefined): Set<CodeDisciplineRuleSlug> {
  const enabled = new Set<CodeDisciplineRuleSlug>();
  if (!rules) return enabled;

  for (const [key, slug] of Object.entries(RULE_SLUG_BY_CONFIG_KEY) as Array<[keyof typeof RULE_SLUG_BY_CONFIG_KEY, CodeDisciplineRuleSlug]>) {
    if (rules[key]) {
      enabled.add(slug);
    }
  }

  return enabled;
}

function normalizeOnlyRules(
  mode: CodeDisciplineMode,
  onlyRules: readonly string[] | undefined,
  rules: CodeDisciplineRules | undefined,
): CodeDisciplineRuleSlug[] | FixableRuleSlug[] | undefined {
  if (!onlyRules || onlyRules.length === 0) return undefined;

  const allowedRules = new Set<string>(mode === "fix" ? FIXABLE_RULE_SLUGS : ALL_RULE_SLUGS);
  const enabledRules = resolveEnabledRuleSlugs(rules);
  const normalized: CodeDisciplineRuleSlug[] = [];

  for (const rule of onlyRules) {
    if (!allowedRules.has(rule)) {
      throw new InvalidCodeDisciplineConfigError(
        mode === "fix"
          ? `Selected rule is not fixable: ${rule}`
          : `Unknown rule selector: ${rule}`,
        { mode, rule },
      );
    }

    if (!enabledRules.has(rule as CodeDisciplineRuleSlug)) {
      throw new InvalidCodeDisciplineConfigError(`Selected rule is not configured: ${rule}`, {
        mode,
        rule,
      });
    }

    if (!normalized.includes(rule as CodeDisciplineRuleSlug)) {
      normalized.push(rule as CodeDisciplineRuleSlug);
    }
  }

  return mode === "fix"
    ? normalized as FixableRuleSlug[]
    : normalized;
}

function shouldRunRule(
  rule: CodeDisciplineRuleSlug,
  onlyRules: readonly string[] | undefined,
): boolean {
  return !onlyRules || onlyRules.length === 0 || onlyRules.includes(rule);
}

export {
  ALL_RULE_SLUGS,
  FIXABLE_RULE_SLUGS,
  RULE_SLUG_BY_CONFIG_KEY,
  normalizeOnlyRules,
  resolveEnabledRuleSlugs,
  shouldRunRule,
};
