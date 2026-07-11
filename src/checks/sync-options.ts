import path from "node:path";

import { DEFAULT_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS } from "../shared/constants.js";
import { readGitignoreExcludedDirs } from "../shared/gitignore.js";
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
    scanObserver: options.scanObserver,
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

export { buildNormalizedSyncOptions };
