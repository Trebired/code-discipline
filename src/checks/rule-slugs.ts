import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type {
  CodeDisciplineMode,
  CodeDisciplineFormatters,
  CodeDisciplineCheckSelectorSlug,
  CodeDisciplineRuleSlug,
  CodeDisciplineRules,
  FixableRuleSlug,
} from "./types.js";

const ALL_RULE_SLUGS: CodeDisciplineRuleSlug[] = [
  "banned-patterns",
  "banned-files",
  "min-file-lines",
  "min-declaration-name",
  "max-file-lines",
  "max-characters-per-line",
  "max-function-lines",
  "folderize-compound-files",
  "sync-imports",
  "remove-comments",
  "structural-blank-lines",
  "dry",
];

const FIXABLE_RULE_SLUGS: FixableRuleSlug[] = [
  "banned-files",
  "min-file-lines",
  "max-characters-per-line",
  "folderize-compound-files",
  "sync-imports",
  "remove-comments",
  "structural-blank-lines",
  "prettier",
];

const FORMATTER_SLUGS = [
  "prettier",
] as const;

const RULE_SLUG_BY_CONFIG_KEY = {
  bannedFiles: "banned-files",
  bannedPatterns: "banned-patterns",
  dry: "dry",
  folderizeCompoundFiles: "folderize-compound-files",
  maxCharactersPerLine: "max-characters-per-line",
  maxFileLines: "max-file-lines",
  maxFunctionLines: "max-function-lines",
  minDeclarationName: "min-declaration-name",
  minFileLines: "min-file-lines",
  removeComments: "remove-comments",
  structuralBlankLines: "structural-blank-lines",
  syncImports: "sync-imports",
} as const;

function resolveEnabledRuleSlugs(
  rules: CodeDisciplineRules | undefined,
): Set<CodeDisciplineRuleSlug> {
  const enabled = new Set<CodeDisciplineRuleSlug>();

  if (rules) {
    for (const [key, slug] of Object.entries(RULE_SLUG_BY_CONFIG_KEY) as Array<[keyof typeof RULE_SLUG_BY_CONFIG_KEY, CodeDisciplineRuleSlug]>) {
      if (rules[key]) {
        enabled.add(slug);
      }
    }
  }

  return enabled;
}

function resolveEnabledFormatterSlugs(
  formatters: CodeDisciplineFormatters | undefined,
): Set<CodeDisciplineCheckSelectorSlug> {
  const enabled = new Set<CodeDisciplineCheckSelectorSlug>();

  if (formatters?.prettier) {
    enabled.add("prettier");
  }

  return enabled;
}

function normalizeOnlyRules(
  mode: CodeDisciplineMode,
  onlyRules: readonly string[] | undefined,
  rules: CodeDisciplineRules | undefined,
  formatters: CodeDisciplineFormatters | undefined,
): CodeDisciplineCheckSelectorSlug[] | FixableRuleSlug[] | undefined {
  if (!onlyRules || onlyRules.length === 0) return undefined;

  const allowedRules = new Set<string>(mode === "fix" ? FIXABLE_RULE_SLUGS : [...ALL_RULE_SLUGS, ...FORMATTER_SLUGS]);
  const enabledRules = resolveEnabledRuleSlugs(rules);
  const enabledFormatters = resolveEnabledFormatterSlugs(formatters);
  const normalized: CodeDisciplineCheckSelectorSlug[] = [];

  for (const rule of onlyRules) {
    if (!allowedRules.has(rule)) {
      throw new InvalidCodeDisciplineConfigError(
        mode === "fix"
          ? `Selected rule is not fixable: ${rule}`
          : `Unknown rule selector: ${rule}`,
        { mode, rule },
      );
    }

    if (!enabledRules.has(rule as CodeDisciplineRuleSlug) && !enabledFormatters.has(rule as CodeDisciplineCheckSelectorSlug)) {
      const knownFormatter = FORMATTER_SLUGS.includes(rule as typeof FORMATTER_SLUGS[number]);
      throw new InvalidCodeDisciplineConfigError(`${knownFormatter ? "Selected selector" : "Selected rule"} is not configured: ${rule}`, {
        mode,
        rule,
      });
    }

    if (!normalized.includes(rule as CodeDisciplineCheckSelectorSlug)) {
      normalized.push(rule as CodeDisciplineCheckSelectorSlug);
    }
  }

  return mode === "fix"
    ? normalized as FixableRuleSlug[]
    : normalized;
}

function shouldRunRule(
  rule: CodeDisciplineCheckSelectorSlug,
  onlyRules: readonly string[] | undefined,
): boolean {
  return !onlyRules || onlyRules.length === 0 || onlyRules.includes(rule);
}

export {
  ALL_RULE_SLUGS,
  FIXABLE_RULE_SLUGS,
  FORMATTER_SLUGS,
  RULE_SLUG_BY_CONFIG_KEY,
  normalizeOnlyRules,
  resolveEnabledFormatterSlugs,
  resolveEnabledRuleSlugs,
  shouldRunRule,
};
