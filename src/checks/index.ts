import { normalizeCheckCodeDisciplineOptions } from "../config/normalize-check-options.js";
import { collectSyncImportViolations } from "../imports/check-sync-imports.js";
import { scanSourceFiles } from "../imports/scan.js";
import { resolveLogger } from "../shared/logging.js";
import { fixFolderization } from "./fix-folderization.js";
import { runFolderizeCompoundFilesRule } from "./rules/folderize-compound-files.js";
import { runMaxFileLinesRule } from "./rules/max-file-lines.js";
import type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineViolation,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";

function buildNormalizedSyncOptions(options: NormalizedCheckCodeDisciplineOptions) {
  return {
    projectRoot: options.projectRoot,
    sourceRoot: options.sourceRoot,
    sourceRootRelative: options.sourceRootRelative,
    sourceExtensions: options.sourceExtensions,
    excludeDirs: options.excludeDirs,
    tsconfigPath: options.rules.syncImports.tsconfigPath ?? `${options.projectRoot}/tsconfig.json`,
    enabled: options.rules.syncImports.enabled ?? false,
    stop: options.rules.syncImports.stop ?? true,
    fix: options.rules.syncImports.fix ?? false,
    alias: {
      prefix: options.rules.syncImports.alias?.prefix ?? "#",
      strategy: options.rules.syncImports.alias?.strategy ?? "random",
      randomLength: options.rules.syncImports.alias?.randomLength ?? 12,
    },
    allowRelative: options.rules.syncImports.allowRelative ?? ["./"],
    logging: options.logging,
  };
}

function sortViolations(violations: CodeDisciplineViolation[]): CodeDisciplineViolation[] {
  return [...violations].sort((left, right) => left.filePath.localeCompare(right.filePath) || left.rule.localeCompare(right.rule));
}

function summarizeViolations(violations: CodeDisciplineViolation[]) {
  const warnings = violations.filter((violation) => !violation.stop).length;
  const failures = violations.length - warnings;

  return {
    ok: failures === 0,
    warnings,
    failures,
  };
}

function logViolation(violation: CodeDisciplineViolation, logger: ReturnType<typeof resolveLogger>) {
  const metadata = {
    rule: violation.rule,
    filePath: violation.filePath,
    suggestedPath: violation.suggestedPath,
    details: violation.details,
  };

  if (violation.stop) {
    logger.error("discipline-violation", violation.message, metadata);
    return;
  }

  logger.warn("discipline-warning", violation.message, metadata);
}

function logSummary(
  label: "check" | "fix",
  result: CheckCodeDisciplineResult | FixCodeDisciplineResult,
  logger: ReturnType<typeof resolveLogger>,
) {
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      logViolation(violation, logger);
    }
  }

  if (result.ok) {
    logger.success(`discipline-${label}-ok`, `${label} completed`, {
      warnings: result.warnings,
      failures: result.failures,
      violations: result.violations.length,
    });
    return;
  }

  logger.error(`discipline-${label}-failed`, `${label} found blocking violations`, {
    warnings: result.warnings,
    failures: result.failures,
    violations: result.violations.length,
  });
}

async function collectViolations(options: NormalizedCheckCodeDisciplineOptions): Promise<CodeDisciplineViolation[]> {
  const sourceFiles = await scanSourceFiles(options);
  const maxFileViolations = await runMaxFileLinesRule(sourceFiles, options);
  const folderizeViolations = runFolderizeCompoundFilesRule(sourceFiles, options);
  const syncImportViolations = await collectSyncImportViolations(sourceFiles, buildNormalizedSyncOptions(options));

  return sortViolations([
    ...maxFileViolations,
    ...folderizeViolations,
    ...syncImportViolations,
  ]);
}

async function checkCodeDiscipline(options: CheckCodeDisciplineOptions): Promise<CheckCodeDisciplineResult> {
  const normalized = await normalizeCheckCodeDisciplineOptions(options);
  const logger = resolveLogger(normalized.logging);
  const violations = await collectViolations(normalized);
  const summary = summarizeViolations(violations);
  const result: CheckCodeDisciplineResult = {
    ...summary,
    violations,
  };

  logSummary("check", result, logger);
  return result;
}

async function fixCodeDiscipline(options: FixCodeDisciplineOptions): Promise<FixCodeDisciplineResult> {
  const normalized = await normalizeCheckCodeDisciplineOptions(options);
  const logger = resolveLogger(normalized.logging);
  const sourceFiles = await scanSourceFiles(normalized);
  const result = await fixFolderization(sourceFiles, normalized, logger);

  if (!result.ok || result.violations.length > 0) {
    logSummary("fix", result, logger);
  } else {
    logger.success("discipline-fix-ok", "fix completed", {
      movedFiles: result.moved_files,
      rewrittenFiles: result.rewritten_files,
      rewrittenImports: result.rewritten_imports,
    });
  }

  return result;
}

export { buildNormalizedSyncOptions, checkCodeDiscipline, fixCodeDiscipline };
