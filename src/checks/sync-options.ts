import path from "node:path";

import { DEFAULT_ALIAS_PREFIX, DEFAULT_REMOVE_DEAD_IMPORTS, DEFAULT_SOURCE_EXTENSIONS } from "#ik5y0pee4ah1";
import { ensureDotExtension, normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import type { CodeDisciplineImportsRuleOptions, NormalizedCheckCodeDisciplineOptions } from "./types.js";
import { mergeExcludeDirEntries } from "#gqxxrd6ye9fj";

const GENERATED_TSCONFIG_PATH = ".code-discipline/generated/tsconfig.paths.json";
const IMPORTS_FOLDER_DIR = ".code-discipline/imports";

function hasExplicitLogging(logging: CodeDisciplineImportsRuleOptions["logging"]): boolean {
  return Boolean(logging?.adapter || logging?.logger);
}

async function buildNormalizedSyncOptions(
  options: NormalizedCheckCodeDisciplineOptions,
  fix: boolean,
  rule: CodeDisciplineImportsRuleOptions | undefined = options.rules.imports,
) {
  if (!rule) return null;

  const sourceRoot = options.sourceRoot;
  const sourceRootRelative = normalizeRelativePath(path.relative(options.projectRoot, sourceRoot));
  const excludedSourceExtensions = rule.excludeSourceExtensions
    ? new Set(rule.excludeSourceExtensions.map(ensureDotExtension))
    : null;
  const sourceExtensions = excludedSourceExtensions
    ? uniqueStrings(DEFAULT_SOURCE_EXTENSIONS.filter((extension) => !excludedSourceExtensions.has(extension)))
    : options.sourceExtensions;
  const gitignorePath = rule.gitignorePath ?? options.gitignorePath;
  const excludeDirs = mergeExcludeDirEntries(options.excludeDirs, rule.excludeDirs ?? []);

  const output = rule.output?.type === "alias-map"
    ? {
      type: "alias-map" as const,
      dir: IMPORTS_FOLDER_DIR,
      generatedTsconfigPath: GENERATED_TSCONFIG_PATH,
      maxEntriesPerFile: Math.max(1, Math.floor(rule.output.maxEntriesPerFile ?? 1000)),
    }
    : { type: "project-manifests" as const };

  return {
    configPath: options.configPath,
    projectRoot: options.projectRoot,
    sourceRoot,
    sourceRootRelative,
    sourceExtensions,
    excludeDirs,
    excludeGitignoreDirs: options.excludeGitignoreDirs,
    gitignorePath,
    progressObserver: options.progressObserver,
    scanObserver: options.scanObserver,
    tsconfigPath: rule.runtime?.tsconfigPath
      ? path.resolve(options.projectRoot, rule.runtime.tsconfigPath)
      : `${options.projectRoot}/tsconfig.json`,
    fix,
    alias: {
      prefix: rule.alias?.prefix ?? "#",
      strategy: rule.alias?.strategy ?? "random",
      randomLength: rule.alias?.randomLength ?? 12,
    },
    allowRelative: rule.allowRelative ?? ["./"],
    output,
    removeDeadImports: rule.removeDeadImports ?? DEFAULT_REMOVE_DEAD_IMPORTS,
    packageJsonImports: {
      enabled: output.type === "project-manifests",
      aliasPrefix: DEFAULT_ALIAS_PREFIX,
      packageJsonPath: "package.json",
    },
    logging: hasExplicitLogging(rule.logging) ? rule.logging : options.logging,
  };
}

export { buildNormalizedSyncOptions };
