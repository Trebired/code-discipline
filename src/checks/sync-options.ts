import path from "node:path";

import { DEFAULT_SOURCE_EXTENSIONS } from "../shared/constants.js";
import { ensureDotExtension, normalizeRelativePath, uniqueStrings } from "../shared/utils.js";
import type { CodeDisciplineSyncImportsRuleOptions, NormalizedCheckCodeDisciplineOptions } from "./types.js";

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
  const excludedSourceExtensions = rule.excludeSourceExtensions
    ? new Set(rule.excludeSourceExtensions.map(ensureDotExtension))
    : null;
  const sourceExtensions = excludedSourceExtensions
    ? uniqueStrings(DEFAULT_SOURCE_EXTENSIONS.filter((extension) => !excludedSourceExtensions.has(extension)))
    : options.sourceExtensions;
  const gitignorePath = rule.gitignorePath ?? options.gitignorePath;
  const excludeFolders = uniqueStrings([
    ...options.excludeFolders,
    ...(rule.excludeFolders ?? []),
  ]);

  return {
    configPath: options.configPath,
    projectRoot: options.projectRoot,
    sourceRoot,
    sourceRootRelative,
    sourceExtensions,
    excludeFolders,
    excludeGitignoreDirs: options.excludeGitignoreDirs,
    gitignorePath,
    progressObserver: options.progressObserver,
    scanObserver: options.scanObserver,
    tsconfigPath: rule.tsconfigPath ?? `${options.projectRoot}/tsconfig.json`,
    fix,
    excludeFiles: rule.excludeFiles ?? [],
    alias: {
      prefix: rule.alias?.prefix ?? "#",
      strategy: rule.alias?.strategy ?? "random",
      randomLength: rule.alias?.randomLength ?? 12,
    },
    allowRelative: rule.allowRelative ?? ["./"],
    importsFolder: {
      enabled: rule.importsFolder?.enabled ?? false,
      dir: rule.importsFolder?.dir ?? "imports",
      maxEntriesPerFile: Math.max(1, Math.floor(rule.importsFolder?.maxEntriesPerFile ?? 1000)),
    },
    generatedTsconfig: {
      enabled: rule.generatedTsconfig?.enabled ?? rule.importsFolder?.enabled ?? false,
      path: rule.generatedTsconfig?.path ?? ".code-discipline/generated/tsconfig.paths.json",
    },
    packageJsonImports: rule.packageJsonImports,
    logging: rule.logging ?? options.logging,
  };
}

export { buildNormalizedSyncOptions };
