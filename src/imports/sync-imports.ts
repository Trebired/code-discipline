import { normalizeSyncImportsOptions } from "../config/normalize-sync-imports-options.js";
import { resolveLogger } from "../shared/logging.js";
import { planTsconfigAliases, syncTsconfigAliases } from "./aliases.js";
import { collectSyncImportViolations } from "./check-sync-imports.js";
import { rewriteSourceImports } from "./rewrite.js";
import { scanSourceFiles } from "./scan.js";
import type { SyncImportsOptions, SyncImportsResult } from "./types.js";

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

    if (!normalized.enabled) {
      const result: SyncImportsResult = {
        ok: true,
        mutations_allowed: false,
        aliases_changed: false,
        aliases_count: plannedAliases.aliasesCount,
        import_violations: 0,
        rewritten_files: 0,
        rewritten_imports: 0,
      };
      logger.flush("info", "sync-disabled", "sync completed", result);
      return result;
    }

    if (!normalized.fix) {
      const failed = normalized.stop && driftViolations.length > 0;
      const result: SyncImportsResult = {
        ok: !failed,
        mutations_allowed: false,
        aliases_changed: plannedAliases.aliasesChanged,
        aliases_count: plannedAliases.aliasesCount,
        import_violations: driftViolations.length,
        rewritten_files: 0,
        rewritten_imports: 0,
      };
      logger.flush(
        failed ? "error" : driftViolations.length > 0 ? "warn" : "success",
        failed ? "sync-drift-detected" : driftViolations.length > 0 ? "sync-drift-warning" : "sync-drift-clear",
        failed
          ? "sync found blocking drift"
          : driftViolations.length > 0
            ? "sync found drift"
            : "sync policy already satisfied",
        result,
      );
      return result;
    }

    const aliasState = plannedAliases.aliasesChanged
      ? await syncTsconfigAliases(normalized, sourceFiles, logger)
      : plannedAliases;
    const rewriteState = await rewriteSourceImports(sourceFiles, aliasState.aliasRecords, normalized, logger);

    const result: SyncImportsResult = {
      ok: true,
      mutations_allowed: true,
      aliases_changed: aliasState.aliasesChanged,
      aliases_count: aliasState.aliasesCount,
      import_violations: 0,
      rewritten_files: rewriteState.rewrittenFiles,
      rewritten_imports: rewriteState.rewrittenImports,
    };
    logger.flush("success", "sync-finished", "sync completed", result);
    return result;
  } catch (error) {
    logger.flush("error", "sync-failed", error instanceof Error ? error.message : "sync failed", {
      cause: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  }
}

export { syncImports };
