import { runCodeFormatter } from "#jnvdqdbcnk3f";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
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
  sourceFiles: ScannedSourceFile[],
): Promise<CodeDisciplineViolation[]> {
  if (!options.rules.formatting || !shouldRunRule("format", options.onlyRules)) return [];
  return (await runCodeFormatter(options, "check", sourceFiles)).violations;
}

async function applyCodeFormatterFix(
  options: NormalizedCheckCodeDisciplineOptions,
  sourceFiles: ScannedSourceFile[],
): Promise<CodeFormatterFixApplication|null> {
  if (!options.rules.formatting || !shouldRunRule("format", options.onlyRules)) return null;

  const result = await runCodeFormatter(options, "fix", sourceFiles);

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
