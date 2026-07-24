import path from "node:path";

import { DEFAULT_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS, DEFAULT_SOURCE_ROOT } from "../../shared/constants.js";
import { readGitignoreExcludedDirs } from "../../shared/gitignore.js";
import { InvalidCodeDisciplineConfigError, InvalidProjectRootError, InvalidSourceRootError } from "../../shared/errors.js";
import { ensureDotExtension, isDirectory, isInsideDirectory, normalizeRelativePath, uniqueStrings } from "../../shared/utils.js";
import type { ExcludeDirEntry, ExcludeDirsOptions, SourceScanObserver } from "../../imports/types.js";
import {
  mergeExcludeDirEntries,
  normalizeExcludeDirEntries,
  normalizeFolderExclusionEntries,
} from "./exclusions.js";

type NormalizedSourceOptions = {
  projectRoot: string;
  sourceRoot: string;
  sourceRootRelative: string;
  sourceExtensions: string[];
  excludeDirs: ExcludeDirEntry[];
  excludeGitignoreDirs: boolean;
  gitignorePath: string;
  scanObserver?: SourceScanObserver;
};

function assertLegacySourceOptionsRemoved(source: Record<string, unknown>): void {
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

  if ("excludeFolders" in source) {
    throw new InvalidCodeDisciplineConfigError("excludeFolders is no longer supported; use excludeDirs", {
      key: "excludeFolders",
    });
  }
}

function resolveSourceRoot(projectRoot: string, sourceRootInput: string): string {
  return path.isAbsolute(sourceRootInput)
    ? path.resolve(sourceRootInput)
    : path.resolve(projectRoot, sourceRootInput);
}

async function readNormalizedGitignoreDirs(
  projectRoot: string,
  options: {
    excludeDirs?: ExcludeDirsOptions;
    gitignorePath?: string;
  },
): Promise<{ excludeGitignoreDirs: boolean; gitignoreDirs: string[]; gitignorePath: string }> {
  const excludeGitignoreDirs = options.excludeDirs?.gitignore === true;
  const gitignoreInput = options.gitignorePath ?? path.join(projectRoot, ".gitignore");
  const gitignorePath = path.isAbsolute(gitignoreInput) ? path.resolve(gitignoreInput) : path.resolve(projectRoot, gitignoreInput);
  const gitignoreDirs = excludeGitignoreDirs
    ? await readGitignoreExcludedDirs(projectRoot, gitignorePath)
    : [];

  return { excludeGitignoreDirs, gitignoreDirs, gitignorePath };
}

async function normalizeSourceOptions(options: {
  projectRoot: string;
  sourceRoot?: string;
  excludeSourceExtensions?: string[];
  excludeDirs?: ExcludeDirsOptions;
  gitignorePath?: string;
  scanObserver?: SourceScanObserver;
}): Promise<NormalizedSourceOptions> {
  const source = options as Record<string, unknown>;
  assertLegacySourceOptionsRemoved(source);

  const projectRoot = path.resolve(options.projectRoot);
  if (!await isDirectory(projectRoot)) {
    throw new InvalidProjectRootError(projectRoot);
  }

  const sourceRootInput = options.sourceRoot ?? DEFAULT_SOURCE_ROOT;
  const sourceRoot = resolveSourceRoot(projectRoot, sourceRootInput);
  if (!await isDirectory(sourceRoot) || !isInsideDirectory(sourceRoot, projectRoot)) {
    throw new InvalidSourceRootError(sourceRoot);
  }

  const { excludeGitignoreDirs, gitignoreDirs, gitignorePath } = await readNormalizedGitignoreDirs(projectRoot, options);
  const excludedExtensions = new Set((options.excludeSourceExtensions ?? []).map(ensureDotExtension));
  const sourceExtensions = uniqueStrings(DEFAULT_SOURCE_EXTENSIONS.filter((extension) => !excludedExtensions.has(extension)));
  const excludeDirs = mergeExcludeDirEntries(
    normalizeFolderExclusionEntries(DEFAULT_EXCLUDE_DIRS),
    normalizeExcludeDirEntries(options.excludeDirs?.entries, "excludeDirs.entries"),
    normalizeFolderExclusionEntries(gitignoreDirs),
  );

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
