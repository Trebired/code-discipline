import { runPrettierFormatter } from "#dxx8c7gob0bd";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { shouldRunRule } from "./rule-slugs.js";
import type {
  FixCodeDisciplineRuleResult,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";

type PrettierFixApplication = {
  formattedFiles: number;
  rewrittenFiles: number;
  ruleResult: FixCodeDisciplineRuleResult;
  unchangedFiles: number;
  violations: CodeDisciplineViolation[];
};

async function collectPrettierViolations(
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  if (!options.formatters.prettier || !shouldRunRule("prettier", options.onlyRules)) return [];
  return (await runPrettierFormatter(options, "check")).violations;
}

async function applyPrettierFormatterFix(
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<PrettierFixApplication | null> {
  if (!options.formatters.prettier || !shouldRunRule("prettier", options.onlyRules)) return null;

  const result = await runPrettierFormatter(options, "fix");

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

export { applyPrettierFormatterFix, collectPrettierViolations };
export type { PrettierFixApplication };
