import { runCodeFormatter } from "#jnvdqdbcnk3f";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { shouldRunRule } from "./rule-slugs.js";
import type {
  FixCodeDisciplineRuleResult,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";

type CodeFormatterFixApplication = {
  formattedFiles: number;
  rewrittenFiles: number;
  ruleResult: FixCodeDisciplineRuleResult;
  unchangedFiles: number;
  violations: CodeDisciplineViolation[];
};

async function collectFormatViolations(
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.formatting || !shouldRunRule("format", options.onlyRules)) return [];
  return (await runCodeFormatter(options, "check")).violations;
}

async function applyCodeFormatterFix(
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeFormatterFixApplication|null> {
  if (!options.rules.formatting || !shouldRunRule("format", options.onlyRules)) return null;

  const result = await runCodeFormatter(options, "fix");

  return {
    formattedFiles: result.formatted_files,
    rewrittenFiles: result.formatted_files,
    unchangedFiles: result.unchanged_files,
    violations: result.violations,
    ruleResult: {
      ok: result.ok,
      violationCount: result.violationCount,
      violations: result.violations,
      formatted_files: result.formatted_files,
      unchanged_files: result.unchanged_files,
      rewritten_files: result.formatted_files,
    },
  };
}

export { applyCodeFormatterFix, collectFormatViolations };
export type { CodeFormatterFixApplication };
