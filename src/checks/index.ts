import { result as createResult } from "@package/result";
import { normalizeCheckOptions } from "#x458f9t6w4a6";
import { scanSourceFiles } from "#ua9whqppp94v";
import { runLogGroup } from "#foa3t3ao5irq";
import { resolveLogger } from "#5koja8ae2wwn";
import type { CodeDisciplineResult, CodeDisciplineViolation } from "#bsmch74up4fm";
import {
  applyBannedFilesFix,
  applyRedundantPathSegmentsFix,
  applyMaxCharactersPerLineFix,
  applyMinFileLinesFix,
  applyCodeFormatterFix,
  applyRemoveEmptyFoldersFix,
  applyRemoveCommentsFix,
  applyStructuralBlankLinesFix,
  applyImportsFix,
} from "./apply-fixes.js";
import type { FixState } from "./apply-fixes.js";
import { collectFormatViolations } from "./format.js";
import { collectNativeCheckViolations } from "./native/runner.js";
import { collectRemoveEmptyFolderViolations } from "./rules/remove/empty-folders.js";
import { applyConfiguredSeverity } from "./severity.js";
import { buildNormalizedSyncOptions } from "./sync-options.js";
import type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";

function sortViolations(violations: CodeDisciplineViolation[]): CodeDisciplineViolation[] {
  return [...violations].sort((left, right) => left.filePath.localeCompare(right.filePath) || left.rule.localeCompare(right.rule));
}

function isBlockingViolation(violation: CodeDisciplineViolation): boolean {
  return violation.severity !== "warning";
}

function summarizeViolations(violations: CodeDisciplineViolation[]): CodeDisciplineResult {
  return {
    ok: violations.every((violation) => !isBlockingViolation(violation)),
    violationCount: violations.length,
    violations,
  };
}

function logSummary(
  label: "check" | "fix",
  result: CheckCodeDisciplineResult | FixCodeDisciplineResult,
  logger: ReturnType<typeof resolveLogger>,
) {
  const blockingCount = result.violations.filter(isBlockingViolation).length;
  if (result.violationCount > 0) {
    const warningCount = result.violationCount - blockingCount;
    const level = blockingCount > 0 ? "fail" : "warn";
    const message = blockingCount > 0
    ? `${label} found ${blockingCount} blocking violation(s)${warningCount > 0 ? ` and ${warningCount} warning(s)` : ""}`
    : `${label} found ${warningCount} warning(s)`;
    logger.flush(level, `discipline-${label}-violations`, message, {
        violationCount: result.violationCount,
      }, { group: runLogGroup(label) });
    return;
  }
  logger.flush("success", `discipline-${label}-ok`, `${label} completed`, {
      violationCount: 0,
    }, { group: runLogGroup(label) });
}

function attachDisciplineResult<T extends CodeDisciplineResult>(
  phase: "check" | "fix",
  output: T,
): T {
  const details = {
    rules: [...new Set(output.violations.map((violation) => violation.rule))],
  };
  return {
    ...output,
    result: output.violations.some(isBlockingViolation)
    ? createResult.error(`discipline-${phase}-violations`, 409, {
        data: {
          violationCount: output.violationCount,
        },
        details,
    })
    : createResult.ok(`discipline-${phase}-ok`, {
        data: {
          violationCount: output.violationCount,
        },
        details,
    }),
  };
}

async function collectViolations(options: NormalizedCheckCodeDisciplineOptions): Promise<CodeDisciplineViolation[]> {
  const sourceFiles = await scanSourceFiles(options);
  const violations = await collectNativeCheckViolations(sourceFiles, options);
  violations.push(...collectRemoveEmptyFolderViolations(options));
  violations.push(...await collectFormatViolations(options, sourceFiles));
  return sortViolations(applyConfiguredSeverity(violations, options));
}

function createFixResult(state: FixState): FixCodeDisciplineResult {
  return {
    ...summarizeViolations(sortViolations(state.violations)),
    deleted_files: state.deletedFiles,
    moved_files: state.movedFiles,
    rewritten_files: state.rewrittenFiles,
    rewritten_imports: state.rewrittenImports,
    removed_comments: state.removedComments,
    formatted_files: state.formattedFiles,
    unchanged_files: state.unchangedFiles,
    ruleResults: state.ruleResults,
  };
}

function logFixResult(result: FixCodeDisciplineResult, logger: ReturnType<typeof resolveLogger>): void {
  if (!result.ok || result.violations.length > 0) {
    logSummary("fix", result, logger);
    return;
  }
  logger.flush("success", "discipline-fix-ok", "fix completed", {
      violationCount: result.violationCount,
      deletedFiles: result.deleted_files,
      movedFiles: result.moved_files,
      rewrittenFiles: result.rewritten_files,
      rewrittenImports: result.rewritten_imports,
      removedComments: result.removed_comments,
      formattedFiles: result.formatted_files,
      unchangedFiles: result.unchanged_files,
      ruleResults: result.ruleResults,
    }, { group: runLogGroup("fix") });
}

async function check(options: CheckCodeDisciplineOptions): Promise<CheckCodeDisciplineResult> {
  const normalized = await normalizeCheckOptions(options, "check");
  const logger = resolveLogger(normalized.logging);
  const violations = await collectViolations(normalized);
  const result: CheckCodeDisciplineResult = attachDisciplineResult("check", summarizeViolations(violations));
  logSummary("check", result, logger);
  return result;
}

async function fix(options: FixCodeDisciplineOptions): Promise<FixCodeDisciplineResult> {
  const normalized = await normalizeCheckOptions(options, "fix");
  const logger = resolveLogger(normalized.logging);
  const state: FixState = {
    deletedFiles: 0,
    movedFiles: 0,
    removedComments: 0,
    formattedFiles: 0,
    unchangedFiles: 0,
    rewrittenFiles: 0,
    rewrittenImports: 0,
    ruleResults: {},
    sourceFiles: await scanSourceFiles(normalized),
    violations: [],
  };
  await applyBannedFilesFix(state, normalized);
  await applyMinFileLinesFix(state, normalized, logger);
  await applyRedundantPathSegmentsFix(state, normalized, logger);
  await applyImportsFix(state, normalized);
  await applyRemoveCommentsFix(state, normalized);
  await applyStructuralBlankLinesFix(state, normalized);
  await applyCodeFormatterFix(state, normalized);
  await applyMaxCharactersPerLineFix(state, normalized);
  await applyRemoveEmptyFoldersFix(state, normalized);
  const result = attachDisciplineResult("fix", createFixResult(state));
  logFixResult(result, logger);
  return result;
}

export { buildNormalizedSyncOptions, check, fix };
