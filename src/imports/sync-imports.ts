import { normalizeSyncImportsOptions } from "../config/normalize-sync-imports-options.js";
import { syncPackageJsonImportsFromTsconfigPaths } from "../runtime/runtime-imports-sync.js";
import { resolveLogger } from "../shared/logging.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";
import { planTsconfigAliases, syncTsconfigAliases } from "./aliases.js";
import { collectSyncImportViolations } from "./check-sync-imports.js";
import { rewriteSourceImports } from "./rewrite.js";
import { scanSourceFiles } from "./scan.js";
import type { SyncImportsOptions, SyncImportsResult } from "./types.js";

function summarizeViolations(violations: CodeDisciplineViolation[]) {
  const warnings = violations.filter((violation) => violation.severity === "warning").length;
  const errors = violations.length - warnings;
  return {
    ok: errors === 0,
    errors,
    warnings,
    violations,
  };
}

async function syncImports(options: SyncImportsOptions): Promise<SyncImportsResult> {
  const normalized = await normalizeSyncImportsOptions(options);
  const logger = resolveLogger(normalized.logging);

  logger.info("sync-started", "sync started", {
    projectRoot: normalized.projectRoot,
    sourceRoot: normalized.sourceRoot,
    tsconfigPath: normalized.tsconfigPath,
    fix: normalized.fix,
  });

  try {
    const sourceFiles = await scanSourceFiles(normalized);
    const plannedAliases = await planTsconfigAliases(normalized, sourceFiles, logger);
    const driftViolations = await collectSyncImportViolations(sourceFiles, normalized, logger);

    if (!normalized.fix) {
      const summary = summarizeViolations(driftViolations);
      const result: SyncImportsResult = {
        ...summary,
        mutations_allowed: false,
        aliases_changed: plannedAliases.aliasesChanged,
        aliases_count: plannedAliases.aliasesCount,
        import_violations: driftViolations.length,
        rewritten_files: 0,
        rewritten_imports: 0,
      };
      logger.flush(
        result.errors > 0 ? "error" : result.warnings > 0 ? "warn" : "success",
        result.errors > 0 ? "sync-drift-detected" : result.warnings > 0 ? "sync-drift-warning" : "sync-drift-clear",
        result.errors > 0
          ? "sync found error drift"
          : result.warnings > 0
            ? "sync found warning drift"
            : "sync policy already satisfied",
        {
          ...result,
          discipline: {
            errors: result.errors,
            warnings: result.warnings,
          },
        },
      );
      return result;
    }

    const aliasState = plannedAliases.aliasesChanged
      ? await syncTsconfigAliases(normalized, sourceFiles, logger)
      : plannedAliases;
    const rewriteState = await rewriteSourceImports(sourceFiles, aliasState.aliasRecords, normalized, logger);
    const packageJsonImportsState = await syncPackageJsonImportsFromTsconfigPaths({
      configPath: normalized.configPath,
      options: normalized.packageJsonImports,
      projectRoot: normalized.projectRoot,
      tsconfigPath: normalized.tsconfigPath,
    });

    const result: SyncImportsResult = {
      ok: true,
      errors: 0,
      warnings: 0,
      violations: [],
      mutations_allowed: true,
      aliases_changed: aliasState.aliasesChanged,
      aliases_count: aliasState.aliasesCount,
      import_violations: 0,
      rewritten_files: rewriteState.rewrittenFiles,
      rewritten_imports: rewriteState.rewrittenImports,
    };
    logger.flush("success", "sync-finished", "sync completed", {
      ...result,
      packageJsonImportsChanged: packageJsonImportsState?.changed ?? false,
    });
    return result;
  } catch (error) {
    logger.flush("error", "sync-failed", error instanceof Error ? error.message : "sync failed", {
      cause: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  }
}

export { syncImports };
