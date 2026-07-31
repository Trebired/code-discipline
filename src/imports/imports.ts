import { normalizeImportsOptions } from "#9sccgd75qe7n";
import { syncPackageJsonImportsFromAliasMap, syncPackageJsonImportsFromTsconfigPaths } from "#51kcncizdqcz";
import { ruleLogGroup } from "#foa3t3ao5irq";
import { resolveLogger } from "#5koja8ae2wwn";
import { filterSourceFilesForRule } from "#jizekc8duh4i";
import { supportsImports } from "#87jyjzn68rrk";
import { ensureGeneratedArtifactsGitignore } from "#zdy5k79iam8y";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { planTsconfigAliases, syncTsconfigAliases } from "./aliases.js";
import { collectImportViolations } from "./check-imports.js";
import { rewriteSourceImports } from "./rewrite.js";
import { scanSourceFiles } from "./scan.js";
import type { ImportsOptions, ImportsResult, NormalizedImportsOptions } from "./types.js";

function summarizeImportViolations(violations: CodeDisciplineViolation[]) {
  return {
    ok: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

function isNormalizedImportsOptions(options: ImportsOptions | NormalizedImportsOptions): options is NormalizedImportsOptions {
  return Array.isArray((options as NormalizedImportsOptions).excludeDirs);
}

function createCheckOnlyResult(args: {
  aliasesChanged: boolean;
  aliasesCount: number;
  violations: CodeDisciplineViolation[];
}): ImportsResult {
  return {
    ...summarizeImportViolations(args.violations),
    mutations_allowed: false,
    aliases_changed: args.aliasesChanged,
    aliases_count: args.aliasesCount,
    import_violations: args.violations.length,
    rewritten_files: 0,
    rewritten_imports: 0,
  };
}

function logCheckOnlyResult(result: ImportsResult, logger: ReturnType<typeof resolveLogger>): void {
  const group = ruleLogGroup("imports");
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
    { group },
  );
}

async function applyImportFixes(
  normalized: NormalizedImportsOptions,
  sourceFiles: Awaited<ReturnType<typeof scanSourceFiles>>,
  plannedAliases: Awaited<ReturnType<typeof planTsconfigAliases>>,
  logger: ReturnType<typeof resolveLogger>,
): Promise<ImportsResult> {
  if (normalized.output.type === "alias-map") {
    const gitignore = await ensureGeneratedArtifactsGitignore(normalized.projectRoot);
    if (gitignore.changed) {
      logger.success("generated-gitignore-written", "generated artifact ignore entry written", {
        gitignorePath: gitignore.path,
      }, { group: ruleLogGroup("imports") });
    }
  }

  const aliasState = plannedAliases.aliasesChanged
    ? await syncTsconfigAliases(normalized, sourceFiles, logger)
    : plannedAliases;
  const rewriteState = await rewriteSourceImports(sourceFiles, aliasState.aliasRecords, normalized, logger);
  const packageJsonImportsState = normalized.output.type === "alias-map" && aliasState.aliasPathMap
    ? await syncPackageJsonImportsFromAliasMap({
      aliasPathMap: aliasState.aliasPathMap,
      cleanWhenDisabled: true,
      configPath: normalized.configPath,
      options: {
        ...normalized.packageJsonImports,
        enabled: false,
      },
      projectRoot: normalized.projectRoot,
    })
    : await syncPackageJsonImportsFromTsconfigPaths({
      configPath: normalized.configPath,
      options: normalized.packageJsonImports,
      projectRoot: normalized.projectRoot,
      tsconfigPath: normalized.tsconfigPath,
    });
  const result: ImportsResult = {
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
  }, { group: ruleLogGroup("imports") });
  return result;
}

async function imports(options: ImportsOptions | NormalizedImportsOptions): Promise<ImportsResult> {
  const normalized = isNormalizedImportsOptions(options)
    ? options
    : await normalizeImportsOptions(options);
  const logger = resolveLogger(normalized.logging);

  logger.info("sync-started", "sync started", {
    projectRoot: normalized.projectRoot,
    sourceRoot: normalized.sourceRoot,
    tsconfigPath: normalized.tsconfigPath,
    output: normalized.output.type,
    fix: normalized.fix,
  }, { group: ruleLogGroup("imports") });

  try {
    const sourceFiles = filterSourceFilesForRule(
      (await scanSourceFiles(normalized)).filter((file) => supportsImports(file.extension)),
      normalized,
    );
    const plannedAliases = await planTsconfigAliases(normalized, sourceFiles, logger);
    const driftViolations = await collectImportViolations(sourceFiles, normalized, logger);

    if (!normalized.fix) {
      const result = createCheckOnlyResult({
        aliasesChanged: plannedAliases.aliasesChanged,
        aliasesCount: plannedAliases.aliasesCount,
        violations: driftViolations,
      });
      logCheckOnlyResult(result, logger);
      return result;
    }

    return applyImportFixes(normalized, sourceFiles, plannedAliases, logger);
  } catch (error) {
    logger.flush("error", "sync-failed", error instanceof Error ? error.message : "sync failed", {
      cause: error instanceof Error ? error.name : typeof error,
    }, { group: ruleLogGroup("imports") });
    throw error;
  }
}

export { imports };
