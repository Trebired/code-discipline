import { normalizeSyncImportsOptions } from "../config/normalize-sync-imports-options.js";
import { syncPackageJsonImportsFromTsconfigPaths } from "../runtime/runtime-imports-sync.js";
import { resolveLogger } from "../shared/logging.js";
import { supportsSyncImports } from "../shared/languages.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";
import { planTsconfigAliases, syncTsconfigAliases } from "./aliases.js";
import { collectSyncImportViolations } from "./check-sync-imports.js";
import { rewriteSourceImports } from "./rewrite.js";
import { scanSourceFiles } from "./scan.js";
import type { NormalizedSyncImportsOptions, SyncImportsOptions, SyncImportsResult } from "./types.js";

function summarizeViolations(violations: CodeDisciplineViolation[]) {
  return {
    ok: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

function isNormalizedSyncImportsOptions(options: SyncImportsOptions | NormalizedSyncImportsOptions): options is NormalizedSyncImportsOptions {
  return Array.isArray((options as NormalizedSyncImportsOptions).excludeDirs);
}

async function syncImports(options: SyncImportsOptions | NormalizedSyncImportsOptions): Promise<SyncImportsResult> {
  const normalized = isNormalizedSyncImportsOptions(options)
    ? options
    : await normalizeSyncImportsOptions(options);
  const logger = resolveLogger(normalized.logging);

  logger.info("sync-started", "sync started", {
    projectRoot: normalized.projectRoot,
    sourceRoot: normalized.sourceRoot,
    tsconfigPath: normalized.tsconfigPath,
    fix: normalized.fix,
  });

  try {
    const sourceFiles = (await scanSourceFiles(normalized)).filter((file) => supportsSyncImports(file.extension));
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
        result.violationCount > 0 ? "warn" : "success",
        result.violationCount > 0 ? "sync-drift-detected" : "sync-drift-clear",
        result.violationCount > 0 ? `sync found ${result.violationCount} drift issue(s)` : "sync policy already satisfied",
        {
          aliasesChanged: result.aliases_changed,
          aliasesCount: result.aliases_count,
          importViolations: result.import_violations,
          mutationAllowed: result.mutations_allowed,
          violationCount: result.violationCount,
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
      violationCount: 0,
      violations: [],
      mutations_allowed: true,
      aliases_changed: aliasState.aliasesChanged,
      aliases_count: aliasState.aliasesCount,
      import_violations: 0,
      rewritten_files: rewriteState.rewrittenFiles,
      rewritten_imports: rewriteState.rewrittenImports,
    };
    logger.flush("success", "sync-finished", "sync completed", {
      aliasesChanged: result.aliases_changed,
      aliasesCount: result.aliases_count,
      rewrittenFiles: result.rewritten_files,
      rewrittenImports: result.rewritten_imports,
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
