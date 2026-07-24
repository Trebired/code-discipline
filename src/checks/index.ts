import { result as createResult } from "@trebired/result";

import { normalizeCheckCodeDisciplineOptions } from "../config/normalize/check-options.js";
import { collectSyncImportViolations } from "../imports/check-sync-imports.js";
import type { ScannedSourceFile } from "../imports/types.js";
import { scanSourceFiles } from "../imports/scan.js";
import { syncImports } from "../imports/sync-imports.js";
import { resolveLogger } from "../shared/logging.js";
import type { CodeDisciplineResult, CodeDisciplineViolation } from "../shared/discipline-types.js";
import { shouldRunRule } from "./rule-slugs.js";
import { fixFolderization } from "./fix-folderization.js";
import { runFolderizeCompoundFilesRule } from "./rules/folderize/compound-files.js";
import { collectBannedFileViolations, fixBannedFilesRule } from "./rules/banned/files.js";
import { collectBannedPatternViolations } from "./rules/banned/patterns.js";
import { collectDryViolations } from "./rules/dry/index.js";
import { runMaxCharactersPerLineRule } from "./rules/max/characters-per-line.js";
import { runMaxFileLinesRule } from "./rules/max/file-lines.js";
import { runMaxFunctionLinesRule } from "./rules/max/function-lines.js";
import { fixMinFileLinesRule } from "./rules/min/file/lines/fix.js";
import { runMinFileLinesRule } from "./rules/min/file/lines.js";
import { collectRemoveCommentsViolations, fixRemoveCommentsRule } from "./rules/remove-comments.js";
import { buildNormalizedSyncOptions } from "./sync-options.js";
import type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FixCodeDisciplineRuleResult,
  FixableRuleSlug,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";

type FixState = {
  deletedFiles: number;
  movedFiles: number;
  removedComments: number;
  rewrittenFiles: number;
  rewrittenImports: number;
  ruleResults: Partial<Record<FixableRuleSlug, FixCodeDisciplineRuleResult>>;
  sourceFiles: ScannedSourceFile[];
  violations: CodeDisciplineViolation[];
};

function sortViolations(violations: CodeDisciplineViolation[]): CodeDisciplineViolation[] {
  return [...violations].sort((left, right) => left.filePath.localeCompare(right.filePath) || left.rule.localeCompare(right.rule));
}

function resolveConfiguredSeverity(
  violation: CodeDisciplineViolation,
  options: NormalizedCheckCodeDisciplineOptions,
): "warning" | "fail" {
  switch (violation.rule) {
    case "banned-patterns":
      return options.rules.bannedPatterns?.severity ?? "fail";
    case "banned-files":
      return options.rules.bannedFiles?.severity ?? "fail";
    case "min-file-lines":
      return options.rules.minFileLines?.severity ?? "fail";
    case "max-file-lines":
      return options.rules.maxFileLines?.severity ?? "fail";
    case "max-characters-per-line":
      return options.rules.maxCharactersPerLine?.severity ?? "fail";
    case "max-function-lines":
      return options.rules.maxFunctionLines?.severity ?? "fail";
    case "folderize-compound-files":
      return options.rules.folderizeCompoundFiles?.severity ?? "fail";
    case "sync-imports":
      return options.rules.syncImports?.severity ?? "fail";
    case "remove-comments":
      return options.rules.removeComments?.severity ?? "fail";
    case "dry":
      return options.rules.dry?.severity ?? "fail";
  }
}

function applyConfiguredSeverity(
  violations: CodeDisciplineViolation[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  return violations.map((violation) => {
    const severity = violation.severity ?? resolveConfiguredSeverity(violation, options);
    return {
      ...violation,
      severity: severity === "warning" ? "warning" : undefined,
    };
  });
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
    logger.flush("warn", `discipline-${label}-violations`, `${label} found ${blockingCount} blocking violation(s) and ${result.violationCount - blockingCount} warning(s)`, {
      violationCount: result.violationCount,
    });
    return;
  }

  logger.flush("success", `discipline-${label}-ok`, `${label} completed`, {
    violationCount: 0,
  });
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
      ? createResult.error(409, `discipline-${phase}-violations`, `${phase} found ${output.violations.filter(isBlockingViolation).length} violation(s).`, {
          data: {
            violationCount: output.violationCount,
          },
          details,
        })
      : createResult.ok(`${phase} completed.`, {
          data: {
            violationCount: output.violationCount,
          },
          details,
        }),
  };
}

async function collectViolations(options: NormalizedCheckCodeDisciplineOptions): Promise<CodeDisciplineViolation[]> {
  const sourceFiles = await scanSourceFiles(options);
  const violations: CodeDisciplineViolation[] = [];

  if (options.rules.bannedPatterns && shouldRunRule("banned-patterns", options.onlyRules)) {
    violations.push(...await collectBannedPatternViolations(sourceFiles, options));
  }

  if (options.rules.bannedFiles && shouldRunRule("banned-files", options.onlyRules)) {
    violations.push(...collectBannedFileViolations(sourceFiles, options));
  }

  if (options.rules.minFileLines && shouldRunRule("min-file-lines", options.onlyRules)) {
    violations.push(...await runMinFileLinesRule(sourceFiles, options));
  }

  if (options.rules.maxFileLines && shouldRunRule("max-file-lines", options.onlyRules)) {
    violations.push(...await runMaxFileLinesRule(sourceFiles, options));
  }

  if (options.rules.maxCharactersPerLine && shouldRunRule("max-characters-per-line", options.onlyRules)) {
    violations.push(...await runMaxCharactersPerLineRule(sourceFiles, options));
  }

  if (options.rules.maxFunctionLines && shouldRunRule("max-function-lines", options.onlyRules)) {
    violations.push(...await runMaxFunctionLinesRule(sourceFiles, options));
  }

  if (options.rules.folderizeCompoundFiles && shouldRunRule("folderize-compound-files", options.onlyRules)) {
    violations.push(...runFolderizeCompoundFilesRule(sourceFiles, options));
  }

  if (options.rules.dry && shouldRunRule("dry", options.onlyRules)) {
    violations.push(...await collectDryViolations(sourceFiles, options));
  }

  if (options.rules.syncImports && shouldRunRule("sync-imports", options.onlyRules)) {
    const normalizedSyncOptions = await buildNormalizedSyncOptions(options, false);
    if (normalizedSyncOptions) {
      violations.push(...await collectSyncImportViolations(sourceFiles, normalizedSyncOptions));
    }
  }

  if (options.rules.removeComments && shouldRunRule("remove-comments", options.onlyRules)) {
    violations.push(...await collectRemoveCommentsViolations(sourceFiles, options));
  }

  return sortViolations(applyConfiguredSeverity(violations, options));
}

function mapFixRuleResult(result: {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  moved_files?: number;
  rewritten_files?: number;
  rewritten_imports?: number;
  removed_comments?: number;
  removed_duplicates?: number;
  added_imports?: number;
  deleted_files?: number;
}): FixCodeDisciplineRuleResult {
  return {
    ok: result.ok,
    violationCount: result.violationCount,
    violations: result.violations,
    moved_files: result.moved_files,
    rewritten_files: result.rewritten_files,
    rewritten_imports: result.rewritten_imports,
    removed_comments: result.removed_comments,
    removed_duplicates: result.removed_duplicates,
    added_imports: result.added_imports,
    deleted_files: result.deleted_files,
  };
}

function shouldRunFixRule(rule: FixableRuleSlug, options: NormalizedCheckCodeDisciplineOptions): boolean {
  return shouldRunRule(rule, options.onlyRules);
}

async function applyBannedFilesFix(state: FixState, normalized: NormalizedCheckCodeDisciplineOptions): Promise<void> {
  if (!normalized.rules.bannedFiles || !shouldRunFixRule("banned-files", normalized)) return;

  const result = await fixBannedFilesRule(state.sourceFiles, normalized);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["banned-files"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.deletedFiles += result.deleted_files ?? 0;

  if ((result.deleted_files ?? 0) > 0) {
    state.sourceFiles = await scanSourceFiles(normalized);
  }
}

async function applyMinFileLinesFix(
  state: FixState,
  normalized: NormalizedCheckCodeDisciplineOptions,
  logger: ReturnType<typeof resolveLogger>,
): Promise<void> {
  if (!normalized.rules.minFileLines || !shouldRunFixRule("min-file-lines", normalized)) return;

  const syncOptions = await buildNormalizedSyncOptions(normalized, true);
  const result = await fixMinFileLinesRule(state.sourceFiles, normalized, logger, syncOptions);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["min-file-lines"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.deletedFiles += result.deleted_files ?? 0;
  state.rewrittenFiles += result.rewritten_files ?? 0;
  state.rewrittenImports += result.rewritten_imports ?? 0;

  if ((result.deleted_files ?? 0) > 0 || (result.rewritten_files ?? 0) > 0) {
    state.sourceFiles = await scanSourceFiles(normalized);
  }
}

async function applyFolderizeFix(
  state: FixState,
  normalized: NormalizedCheckCodeDisciplineOptions,
  logger: ReturnType<typeof resolveLogger>,
): Promise<void> {
  if (!normalized.rules.folderizeCompoundFiles || !shouldRunFixRule("folderize-compound-files", normalized)) return;

  const result = await fixFolderization(state.sourceFiles, normalized, logger);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["folderize-compound-files"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.movedFiles += result.moved_files;
  state.rewrittenFiles += result.rewritten_files;
  state.rewrittenImports += result.rewritten_imports;

  if (result.moved_files > 0 || result.rewritten_files > 0) {
    state.sourceFiles = await scanSourceFiles(normalized);
  }
}

async function applySyncImportsFix(state: FixState, normalized: NormalizedCheckCodeDisciplineOptions): Promise<void> {
  if (!normalized.rules.syncImports || !shouldRunFixRule("sync-imports", normalized)) return;

  const syncOptions = await buildNormalizedSyncOptions(normalized, true);
  if (!syncOptions) return;

  const result = await syncImports(syncOptions);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["sync-imports"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.rewrittenFiles += result.rewritten_files;
  state.rewrittenImports += result.rewritten_imports;
}

async function applyRemoveCommentsFix(state: FixState, normalized: NormalizedCheckCodeDisciplineOptions): Promise<void> {
  if (!normalized.rules.removeComments || !shouldRunFixRule("remove-comments", normalized)) return;

  const result = await fixRemoveCommentsRule(state.sourceFiles, normalized);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["remove-comments"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.rewrittenFiles += result.rewritten_files ?? 0;
  state.removedComments += result.removed_comments ?? 0;
}

function createFixResult(state: FixState): FixCodeDisciplineResult {
  return {
    ...summarizeViolations(sortViolations(state.violations)),
    deleted_files: state.deletedFiles,
    moved_files: state.movedFiles,
    rewritten_files: state.rewrittenFiles,
    rewritten_imports: state.rewrittenImports,
    removed_comments: state.removedComments,
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
    ruleResults: result.ruleResults,
  });
}

async function checkCodeDiscipline(options: CheckCodeDisciplineOptions): Promise<CheckCodeDisciplineResult> {
  const normalized = await normalizeCheckCodeDisciplineOptions(options, "check");
  const logger = resolveLogger(normalized.logging);
  const violations = await collectViolations(normalized);
  const result: CheckCodeDisciplineResult = attachDisciplineResult("check", summarizeViolations(violations));

  logSummary("check", result, logger);
  return result;
}

async function fixCodeDiscipline(options: FixCodeDisciplineOptions): Promise<FixCodeDisciplineResult> {
  const normalized = await normalizeCheckCodeDisciplineOptions(options, "fix");
  const logger = resolveLogger(normalized.logging);
  const state: FixState = {
    deletedFiles: 0,
    movedFiles: 0,
    removedComments: 0,
    rewrittenFiles: 0,
    rewrittenImports: 0,
    ruleResults: {},
    sourceFiles: await scanSourceFiles(normalized),
    violations: [],
  };

  await applyBannedFilesFix(state, normalized);
  await applyMinFileLinesFix(state, normalized, logger);
  await applyFolderizeFix(state, normalized, logger);
  await applySyncImportsFix(state, normalized);
  await applyRemoveCommentsFix(state, normalized);

  const result = attachDisciplineResult("fix", createFixResult(state));
  logFixResult(result, logger);
  return result;
}

export { buildNormalizedSyncOptions, checkCodeDiscipline, fixCodeDiscipline };
