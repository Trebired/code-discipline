import { normalizeCheckCodeDisciplineOptions } from "../config/normalize-check-options.js";
import { collectSyncImportViolations } from "../imports/check-sync-imports.js";
import { scanSourceFiles } from "../imports/scan.js";
import { resolveLogger } from "../shared/logging.js";
import type { CodeDisciplineResult, CodeDisciplineViolation } from "../shared/discipline-types.js";
import { fixFolderization } from "./fix-folderization.js";
import { runFolderizeCompoundFilesRule } from "./rules/folderize-compound-files.js";
import { runMaxFileLinesRule } from "./rules/max-file-lines.js";
import type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  NormalizedCheckCodeDisciplineOptions,
} from "./types.js";

function buildNormalizedSyncOptions(options: NormalizedCheckCodeDisciplineOptions) {
  if (!options.rules.syncImports) return null;

  return {
    projectRoot: options.projectRoot,
    sourceRoot: options.sourceRoot,
    sourceRootRelative: options.sourceRootRelative,
    sourceExtensions: options.sourceExtensions,
    excludeDirs: options.excludeDirs,
    tsconfigPath: options.rules.syncImports.tsconfigPath ?? `${options.projectRoot}/tsconfig.json`,
    severity: options.rules.syncImports.severity ?? "error",
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

function summarizeViolations(violations: CodeDisciplineViolation[]): CodeDisciplineResult {
  const warnings = violations.filter((violation) => violation.severity === "warning").length;
  const errors = violations.length - warnings;

  return {
    ok: errors === 0,
    errors,
    warnings,
    violations,
  };
}

function logSummary(
  label: "check" | "fix",
  result: CheckCodeDisciplineResult | FixCodeDisciplineResult,
  logger: ReturnType<typeof resolveLogger>,
) {
  if (result.errors > 0) {
    logger.flush("error", `discipline-${label}-failed`, `${label} completed with error violations`, {
      discipline: {
        errors: result.errors,
        warnings: result.warnings,
      },
      errors: result.errors,
      warnings: result.warnings,
      violations: result.violations,
    });
    return;
  }

  if (result.warnings > 0) {
    logger.flush("warn", `discipline-${label}-warning`, `${label} completed with warning violations`, {
      discipline: {
        errors: result.errors,
        warnings: result.warnings,
      },
      errors: result.errors,
      warnings: result.warnings,
      violations: result.violations,
    });
    return;
  }

  logger.flush(`success`, `discipline-${label}-ok`, `${label} completed`, {
    discipline: {
      errors: result.errors,
      warnings: result.warnings,
    },
    errors: result.errors,
    warnings: result.warnings,
    violations: result.violations,
  });
}

async function collectViolations(options: NormalizedCheckCodeDisciplineOptions): Promise<CodeDisciplineViolation[]> {
  const sourceFiles = await scanSourceFiles(options);
  const maxFileViolations = options.rules.maxFileLines
    ? await runMaxFileLinesRule(sourceFiles, options)
    : [];
  const folderizeViolations = options.rules.folderizeCompoundFiles
    ? runFolderizeCompoundFilesRule(sourceFiles, options)
    : [];
  const normalizedSyncOptions = buildNormalizedSyncOptions(options);
  const syncImportViolations = normalizedSyncOptions
    ? await collectSyncImportViolations(sourceFiles, normalizedSyncOptions)
    : [];

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
  const result: CheckCodeDisciplineResult = summarizeViolations(violations);

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
    logger.flush("success", "discipline-fix-ok", "fix completed", {
      discipline: {
        errors: result.errors,
        warnings: result.warnings,
      },
      errors: result.errors,
      warnings: result.warnings,
      movedFiles: result.moved_files,
      rewrittenFiles: result.rewritten_files,
      rewrittenImports: result.rewritten_imports,
    });
  }

  return result;
}

export { buildNormalizedSyncOptions, checkCodeDiscipline, fixCodeDiscipline };
