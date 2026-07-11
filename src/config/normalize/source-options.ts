import path from "node:path";

import { DEFAULT_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS, DEFAULT_SOURCE_ROOT } from "../../shared/constants.js";
import { readGitignoreExcludedDirs } from "../../shared/gitignore.js";
import { InvalidCodeDisciplineConfigError, InvalidProjectRootError, InvalidSourceRootError } from "../../shared/errors.js";
import { ensureDotExtension, isDirectory, isInsideDirectory, normalizeRelativePath, uniqueStrings } from "../../shared/utils.js";
import type { ExcludeDirsOptions, SourceScanObserver } from "../../imports/types.js";

type NormalizedSourceOptions = {
  projectRoot: string;
  sourceRoot: string;
  sourceRootRelative: string;
  sourceExtensions: string[];
  excludeDirs: string[];
  excludeGitignoreDirs: boolean;
  gitignorePath: string;
  scanObserver?: SourceScanObserver;
};

async function normalizeSourceOptions(options: {
  projectRoot: string;
  sourceRoot?: string;
  excludeSourceExtensions?: string[];
  excludeDirs?: ExcludeDirsOptions;
  gitignorePath?: string;
  scanObserver?: SourceScanObserver;
}): Promise<NormalizedSourceOptions> {
  const source = options as Record<string, unknown>;
  if ("sourceExtensions" in source) {
    throw new InvalidCodeDisciplineConfigError("sourceExtensions is no longer supported; use excludeSourceExtensions", {
      key: "sourceExtensions",
    });
  }

  if ("includeDefaultSourceExtensions" in source) {
    throw new InvalidCodeDisciplineConfigError("includeDefaultSourceExtensions is no longer supported; use excludeSourceExtensions", {
      key: "includeDefaultSourceExtensions",
    });
  }

  const projectRoot = path.resolve(options.projectRoot);
  if (!await isDirectory(projectRoot)) {
    throw new InvalidProjectRootError(projectRoot);
  }

  const sourceRootInput = options.sourceRoot ?? DEFAULT_SOURCE_ROOT;
  const sourceRoot = path.isAbsolute(sourceRootInput) ? path.resolve(sourceRootInput) : path.resolve(projectRoot, sourceRootInput);
  if (!await isDirectory(sourceRoot) || !isInsideDirectory(sourceRoot, projectRoot)) {
    throw new InvalidSourceRootError(sourceRoot);
  }

  const excludeGitignoreDirs = options.excludeDirs?.gitignore === true;
  const gitignoreInput = options.gitignorePath ?? path.join(projectRoot, ".gitignore");
  const gitignorePath = path.isAbsolute(gitignoreInput) ? path.resolve(gitignoreInput) : path.resolve(projectRoot, gitignoreInput);
  const gitignoreDirs = excludeGitignoreDirs
    ? await readGitignoreExcludedDirs(projectRoot, gitignorePath)
    : [];
  const excludedExtensions = new Set((options.excludeSourceExtensions ?? []).map(ensureDotExtension));
  const sourceExtensions = uniqueStrings(DEFAULT_SOURCE_EXTENSIONS.filter((extension) => !excludedExtensions.has(extension)));
  const excludeDirs = uniqueStrings([
    ...DEFAULT_EXCLUDE_DIRS,
    ...(options.excludeDirs?.dirs ?? []),
    ...gitignoreDirs,
  ]);

  return {
    projectRoot,
    sourceRoot,
    sourceRootRelative: normalizeRelativePath(path.relative(projectRoot, sourceRoot)),
    sourceExtensions,
    excludeDirs,
    excludeGitignoreDirs,
    gitignorePath,
    scanObserver: options.scanObserver,
  };
}

export { normalizeSourceOptions };
export type { NormalizedSourceOptions };
