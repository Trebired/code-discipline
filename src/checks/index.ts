import path from "node:path";

import { normalizeCheckCodeDisciplineOptions } from "../config/normalize-check-options.js";
import { collectSyncImportViolations } from "../imports/check-sync-imports.js";
import { scanSourceFiles } from "../imports/scan.js";
import { syncImports } from "../imports/sync-imports.js";
import { DEFAULT_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS } from "../shared/constants.js";
import { readGitignoreExcludedDirs } from "../shared/gitignore.js";
import { resolveLogger } from "../shared/logging.js";
import type { CodeDisciplineResult, CodeDisciplineViolation } from "../shared/discipline-types.js";
import { ensureDotExtension, normalizeRelativePath, uniqueStrings } from "../shared/utils.js";
import { shouldRunRule } from "./rule-slugs.js";
import { fixFolderization } from "./fix-folderization.js";
import { runFolderizeCompoundFilesRule } from "./rules/folderize-compound-files.js";
import { collectDryViolations, fixDryRule } from "./rules/dry.js";
import { runMaxFileLinesRule } from "./rules/max-file-lines.js";
import { runMaxFunctionLinesRule } from "./rules/max-function-lines.js";
import type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineSyncImportsRuleOptions,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FixCodeDisciplineRuleResult,
  FixableRuleSlug,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";

async function buildNormalizedSyncOptions(
  options: NormalizedCheckCodeDisciplineOptions,
  fix: boolean,
  rule: CodeDisciplineSyncImportsRuleOptions | undefined = options.rules.syncImports,
) {
  if (!rule) return null;

  const sourceRootInput = rule.sourceRoot ?? options.sourceRoot;
  const sourceRoot = path.isAbsolute(sourceRootInput)
    ? path.resolve(sourceRootInput)
    : path.resolve(options.projectRoot, sourceRootInput);
  const sourceRootRelative = normalizeRelativePath(path.relative(options.projectRoot, sourceRoot));
  const sourceExtensions = rule.sourceExtensions
    ? uniqueStrings([
      ...(rule.includeDefaultSourceExtensions === false ? [] : DEFAULT_SOURCE_EXTENSIONS),
      ...rule.sourceExtensions.map(ensureDotExtension),
    ])
    : options.sourceExtensions;
  const gitignorePath = rule.gitignorePath ?? options.gitignorePath;
  const gitignoreDirs = rule.excludeDirs?.gitignore === true
    ? await readGitignoreExcludedDirs(options.projectRoot, gitignorePath)
    : [];
  const excludeDirs = rule.excludeDirs
    ? uniqueStrings([
      ...DEFAULT_EXCLUDE_DIRS,
      ...(rule.excludeDirs.dirs ?? []),
      ...gitignoreDirs,
    ])
    : options.excludeDirs;

  return {
    configPath: options.configPath,
    projectRoot: options.projectRoot,
    sourceRoot,
    sourceRootRelative,
    sourceExtensions,
    excludeDirs,
    excludeGitignoreDirs: rule.excludeDirs?.gitignore ?? options.excludeGitignoreDirs,
    gitignorePath,
    tsconfigPath: rule.tsconfigPath ?? `${options.projectRoot}/tsconfig.json`,
    fix,
    alias: {
      prefix: rule.alias?.prefix ?? "#",
      strategy: rule.alias?.strategy ?? "random",
      randomLength: rule.alias?.randomLength ?? 12,
    },
    allowRelative: rule.allowRelative ?? ["./"],
    packageJsonImports: rule.packageJsonImports,
    logging: rule.logging ?? options.logging,
  };
}

function sortViolations(violations: CodeDisciplineViolation[]): CodeDisciplineViolation[] {
  return [...violations].sort((left, right) => left.filePath.localeCompare(right.filePath) || left.rule.localeCompare(right.rule));
}

function summarizeViolations(violations: CodeDisciplineViolation[]): CodeDisciplineResult {
  return {
    ok: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

function logSummary(
  label: "check" | "fix",
  result: CheckCodeDisciplineResult | FixCodeDisciplineResult,
  logger: ReturnType<typeof resolveLogger>,
) {
  if (result.violationCount > 0) {
    logger.flush("warn", `discipline-${label}-violations`, `${label} found ${result.violationCount} violation(s)`, {
      violationCount: result.violationCount,
    });
    return;
  }

  logger.flush("success", `discipline-${label}-ok`, `${label} completed`, {
    violationCount: 0,
  });
}

async function collectViolations(options: NormalizedCheckCodeDisciplineOptions): Promise<CodeDisciplineViolation[]> {
  const sourceFiles = await scanSourceFiles(options);
  const violations: CodeDisciplineViolation[] = [];

  if (options.rules.maxFileLines && shouldRunRule("max-file-lines", options.onlyRules)) {
    violations.push(...await runMaxFileLinesRule(sourceFiles, options));
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

  return sortViolations(violations);
}

function mapFixRuleResult(result: {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  moved_files?: number;
  rewritten_files?: number;
  rewritten_imports?: number;
  removed_duplicates?: number;
  added_imports?: number;
}): FixCodeDisciplineRuleResult {
  return {
    ok: result.ok,
    violationCount: result.violationCount,
    violations: result.violations,
    moved_files: result.moved_files,
    rewritten_files: result.rewritten_files,
    rewritten_imports: result.rewritten_imports,
    removed_duplicates: result.removed_duplicates,
    added_imports: result.added_imports,
  };
}

function shouldRunFixRule(rule: FixableRuleSlug, options: NormalizedCheckCodeDisciplineOptions): boolean {
  return shouldRunRule(rule, options.onlyRules);
}

async function checkCodeDiscipline(options: CheckCodeDisciplineOptions): Promise<CheckCodeDisciplineResult> {
  const normalized = await normalizeCheckCodeDisciplineOptions(options, "check");
  const logger = resolveLogger(normalized.logging);
  const violations = await collectViolations(normalized);
  const result: CheckCodeDisciplineResult = summarizeViolations(violations);

  logSummary("check", result, logger);
  return result;
}

async function fixCodeDiscipline(options: FixCodeDisciplineOptions): Promise<FixCodeDisciplineResult> {
  const normalized = await normalizeCheckCodeDisciplineOptions(options, "fix");
  const logger = resolveLogger(normalized.logging);
  const ruleResults: Partial<Record<FixableRuleSlug, FixCodeDisciplineRuleResult>> = {};
  const violations: CodeDisciplineViolation[] = [];
  let movedFiles = 0;
  let rewrittenFiles = 0;
  let rewrittenImports = 0;
  let sourceFiles = await scanSourceFiles(normalized);

  if (normalized.rules.folderizeCompoundFiles && shouldRunFixRule("folderize-compound-files", normalized)) {
    const folderizeResult = await fixFolderization(sourceFiles, normalized, logger);
    ruleResults["folderize-compound-files"] = mapFixRuleResult(folderizeResult);
    violations.push(...folderizeResult.violations);
    movedFiles += folderizeResult.moved_files;
    rewrittenFiles += folderizeResult.rewritten_files;
    rewrittenImports += folderizeResult.rewritten_imports;

    if (folderizeResult.moved_files > 0 || folderizeResult.rewritten_files > 0) {
      sourceFiles = await scanSourceFiles(normalized);
    }
  }

  if (normalized.rules.dry && shouldRunFixRule("dry", normalized)) {
    const dryResult = await fixDryRule(sourceFiles, normalized);
    ruleResults.dry = mapFixRuleResult(dryResult);
    violations.push(...dryResult.violations);
    rewrittenFiles += dryResult.rewritten_files ?? 0;

    if ((dryResult.rewritten_files ?? 0) > 0) {
      sourceFiles = await scanSourceFiles(normalized);
    }
  }

  if (normalized.rules.syncImports && shouldRunFixRule("sync-imports", normalized)) {
    const syncOptions = await buildNormalizedSyncOptions(normalized, true);
    if (syncOptions) {
      const syncResult = await syncImports(syncOptions);
      ruleResults["sync-imports"] = mapFixRuleResult(syncResult);
      violations.push(...syncResult.violations);
      rewrittenFiles += syncResult.rewritten_files;
      rewrittenImports += syncResult.rewritten_imports;
    }
  }

  const summary = summarizeViolations(sortViolations(violations));
  const result: FixCodeDisciplineResult = {
    ...summary,
    moved_files: movedFiles,
    rewritten_files: rewrittenFiles,
    rewritten_imports: rewrittenImports,
    ruleResults,
  };

  if (!result.ok || result.violations.length > 0) {
    logSummary("fix", result, logger);
  } else {
    logger.flush("success", "discipline-fix-ok", "fix completed", {
      violationCount: result.violationCount,
      movedFiles: result.moved_files,
      rewrittenFiles: result.rewritten_files,
      rewrittenImports: result.rewritten_imports,
      ruleResults: result.ruleResults,
    });
  }

  return result;
}

export { buildNormalizedSyncOptions, checkCodeDiscipline, fixCodeDiscipline };
