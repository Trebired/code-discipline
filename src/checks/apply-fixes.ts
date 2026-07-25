import { scanSourceFiles } from "../imports/scan.js";
import { syncImports } from "../imports/sync-imports.js";
import type { ScannedSourceFile } from "../imports/types.js";
import { filterSourceFilesForRule } from "../shared/rule-exclusions.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";
import type { resolveLogger } from "../shared/logging.js";
import { fixFolderization } from "./fix-folderization.js";
import { applyPrettierFormatterFix } from "./prettier.js";
import { shouldRunRule } from "./rule-slugs.js";
import { fixBannedFilesRule } from "./rules/banned/files.js";
import { fixStructuralBlankLinesRule } from "./rules/blank-lines/index.js";
import { fixMinFileLinesRule } from "./rules/min/file/lines/fix.js";
import { fixRemoveCommentsRule } from "./rules/remove-comments.js";
import { fixTsNocheckAuditRule } from "./rules/ts-nocheck-audit/index.js";
import { applyConfiguredSeverity } from "./severity.js";
import { buildNormalizedSyncOptions } from "./sync-options.js";
import type { FixableRuleSlug, FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "./types.js";

type FixState = {
  deletedFiles: number;
  movedFiles: number;
  removedComments: number;
  formattedFiles: number;
  unchangedFiles: number;
  rewrittenFiles: number;
  rewrittenImports: number;
  ruleResults: Partial<Record<FixableRuleSlug, FixCodeDisciplineRuleResult>>;
  sourceFiles: ScannedSourceFile[];
  violations: CodeDisciplineViolation[];
};

function mapFixRuleResult(result: {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  moved_files?: number;
  rewritten_files?: number;
  rewritten_imports?: number;
  removed_comments?: number;
  formatted_files?: number;
  unchanged_files?: number;
  removed_duplicates?: number;
  added_imports?: number;
  deleted_files?: number;
  inserted_blank_lines?: number;
  removed_blank_lines?: number;
}): FixCodeDisciplineRuleResult {
  return {
    ok: result.ok,
    violationCount: result.violationCount,
    violations: result.violations,
    moved_files: result.moved_files,
    rewritten_files: result.rewritten_files,
    rewritten_imports: result.rewritten_imports,
    removed_comments: result.removed_comments,
    formatted_files: result.formatted_files,
    unchanged_files: result.unchanged_files,
    removed_duplicates: result.removed_duplicates,
    added_imports: result.added_imports,
    deleted_files: result.deleted_files,
    inserted_blank_lines: result.inserted_blank_lines,
    removed_blank_lines: result.removed_blank_lines,
  };
}

function shouldRunFixRule(rule: FixableRuleSlug, options: NormalizedCheckCodeDisciplineOptions): boolean {
  return shouldRunRule(rule, options.onlyRules);
}

async function applyBannedFilesFix(state: FixState, normalized: NormalizedCheckCodeDisciplineOptions): Promise<void> {
  if (!normalized.rules.bannedFiles || !shouldRunFixRule("banned-files", normalized)) return;

  const result = await fixBannedFilesRule(filterSourceFilesForRule(state.sourceFiles, normalized.rules.bannedFiles), normalized);
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
  const result = await fixMinFileLinesRule(filterSourceFilesForRule(state.sourceFiles, normalized.rules.minFileLines), normalized, logger, syncOptions);
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

  const result = await fixFolderization(filterSourceFilesForRule(state.sourceFiles, normalized.rules.folderizeCompoundFiles), normalized, logger);
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

  const result = await fixRemoveCommentsRule(filterSourceFilesForRule(state.sourceFiles, normalized.rules.removeComments), normalized);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["remove-comments"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.rewrittenFiles += result.rewritten_files ?? 0;
  state.removedComments += result.removed_comments ?? 0;
}

async function applyStructuralBlankLinesFix(state: FixState, normalized: NormalizedCheckCodeDisciplineOptions): Promise<void> {
  if (!normalized.rules.structuralBlankLines || !shouldRunFixRule("structural-blank-lines", normalized)) return;

  const result = await fixStructuralBlankLinesRule(filterSourceFilesForRule(state.sourceFiles, normalized.rules.structuralBlankLines), normalized);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["structural-blank-lines"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.rewrittenFiles += result.rewritten_files ?? 0;
}

async function applyTsNocheckAuditFix(state: FixState, normalized: NormalizedCheckCodeDisciplineOptions): Promise<void> {
  if (!normalized.rules.tsNocheckAudit || !shouldRunFixRule("ts-nocheck-audit", normalized)) return;

  const result = await fixTsNocheckAuditRule(filterSourceFilesForRule(state.sourceFiles, normalized.rules.tsNocheckAudit), normalized);
  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults["ts-nocheck-audit"] = mapFixRuleResult({ ...result, violations });
  state.violations.push(...violations);
  state.rewrittenFiles += result.rewritten_files ?? 0;
}

async function applyPrettierFix(state: FixState, normalized: NormalizedCheckCodeDisciplineOptions): Promise<void> {
  const result = await applyPrettierFormatterFix(normalized);
  if (!result) return;

  const violations = applyConfiguredSeverity(result.violations, normalized);
  state.ruleResults.prettier = mapFixRuleResult({ ...result.ruleResult, violations });
  state.violations.push(...violations);
  state.formattedFiles += result.formattedFiles;
  state.unchangedFiles += result.unchangedFiles;
  state.rewrittenFiles += result.rewrittenFiles;
}

export {
  applyBannedFilesFix,
  applyFolderizeFix,
  applyMinFileLinesFix,
  applyPrettierFix,
  applyRemoveCommentsFix,
  applyStructuralBlankLinesFix,
  applySyncImportsFix,
  applyTsNocheckAuditFix,
};
export type { FixState };
