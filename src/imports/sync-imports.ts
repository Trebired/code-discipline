import { normalizeSyncImportsOptions } from "../config/normalize-sync-imports-options.js";
import { resolveLogger } from "../shared/logging.js";
import { rewriteSourceImports } from "./rewrite.js";
import { scanSourceFiles } from "./scan.js";
import { syncTsconfigAliases } from "./aliases.js";
import type { SyncImportsOptions, SyncImportsResult } from "./types.js";

async function syncImports(options: SyncImportsOptions): Promise<SyncImportsResult> {
  const normalized = await normalizeSyncImportsOptions(options);
  const logger = resolveLogger(normalized.logging);

  logger.info("sync-started", "sync started", {
    projectRoot: normalized.projectRoot,
    sourceRoot: normalized.sourceRoot,
    tsconfigPath: normalized.tsconfigPath,
  });

  try {
    const sourceFiles = await scanSourceFiles(normalized);
    const aliasState = await syncTsconfigAliases(normalized, sourceFiles, logger);
    const rewriteState = normalized.imports.rewrite
      ? await rewriteSourceImports(sourceFiles, aliasState.aliasRecords, normalized, logger)
      : { rewrittenFiles: 0, rewrittenImports: 0 };

    logger.success(
      "sync-finished",
      `rewritten files=${rewriteState.rewrittenFiles} imports=${rewriteState.rewrittenImports}`,
      {
        aliasesChanged: aliasState.aliasesChanged,
        aliasesCount: aliasState.aliasesCount,
        rewrittenFiles: rewriteState.rewrittenFiles,
        rewrittenImports: rewriteState.rewrittenImports,
      },
    );

    return {
      aliases_changed: aliasState.aliasesChanged,
      aliases_count: aliasState.aliasesCount,
      rewritten_files: rewriteState.rewrittenFiles,
      rewritten_imports: rewriteState.rewrittenImports,
    };
  } catch (error) {
    logger.error("sync-failed", error instanceof Error ? error.message : "sync failed", {
      cause: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  }
}

export { syncImports };
