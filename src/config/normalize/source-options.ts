import path from "node:path";
import { DEFAULT_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS, DEFAULT_SOURCE_ROOT } from "#ik5y0pee4ah1";
import { readGitignoreExcludedDirs, readGitignoreIgnorePatterns } from "#0nr05vmcrtql";
import { InvalidCodeDisciplineConfigError, InvalidProjectRootError, InvalidSourceRootError } from "#4f8hale01wb4";
import { ensureDotExtension, isDirectory, isInsideDirectory, normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import type {
  CodeDisciplineIgnoreOptions,
  ExcludeDirEntry,
  NormalizedCodeDisciplineIgnore,
  SourceScanObserver,
} from "#pkb9x3eo56l7";
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
  ignore: NormalizedCodeDisciplineIgnore;
  scanObserver?: SourceScanObserver;
};
function assertLegacySourceOptionsRemoved(source: Record<string, unknown>): void {
  if ("sourceRoot" in source) {
    throw new InvalidCodeDisciplineConfigError("sourceRoot is no longer supported; use ignore to narrow scanned files", {
      key: "sourceRoot",
    });
  }
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
    throw new InvalidCodeDisciplineConfigError("excludeFolders is no longer supported; use ignore", {
      key: "excludeFolders",
    });
  }
  if ("excludeDirs" in source) {
    throw new InvalidCodeDisciplineConfigError("excludeDirs is no longer supported; use ignore", {
      key: "excludeDirs",
    });
  }
}
function normalizeIgnoreOptions(options: { ignore?: CodeDisciplineIgnoreOptions }): CodeDisciplineIgnoreOptions {
  const ignore = options.ignore;
  if (ignore === undefined) return {};
  if (!ignore || typeof ignore !== "object" || Array.isArray(ignore)) {
    throw new InvalidCodeDisciplineConfigError("ignore must be an object when provided", {
      key: "ignore",
      value: ignore,
    });
  }
  const source = ignore as Record<string, unknown>;
  if ("gitignore" in source) {
    throw new InvalidCodeDisciplineConfigError("ignore.gitignore is no longer supported; use ignore.use_gitignore", {
      key: "ignore.gitignore",
    });
  }
  if (ignore.use_gitignore !== undefined && typeof ignore.use_gitignore !== "boolean") {
    throw new InvalidCodeDisciplineConfigError("ignore.use_gitignore must be boolean when provided", {
      key: "ignore.use_gitignore",
      value: ignore.use_gitignore,
    });
  }
  return ignore;
}
function resolveSourceRoot(projectRoot: string, sourceRootInput: string): string {
  return path.isAbsolute(sourceRootInput)
    ? path.resolve(sourceRootInput)
    : path.resolve(projectRoot, sourceRootInput);
}
async function readNormalizedGitignoreDirs(
  projectRoot: string,
  options: {
    ignore?: CodeDisciplineIgnoreOptions;
    gitignorePath?: string;
  },
): Promise<{ gitignoreDirs: string[]; gitignorePath: string; gitignorePatterns: string[]; useGitignore: boolean }> {
  const useGitignore = options.ignore?.use_gitignore === true;
  const gitignoreInput = options.gitignorePath ?? path.join(projectRoot, ".gitignore");
  const gitignorePath = path.isAbsolute(gitignoreInput) ? path.resolve(gitignoreInput) : path.resolve(projectRoot, gitignoreInput);
  const gitignoreDirs = useGitignore
    ? await readGitignoreExcludedDirs(projectRoot, gitignorePath)
    : [];
  const gitignorePatterns = useGitignore
    ? await readGitignoreIgnorePatterns(gitignorePath)
    : [];
  return { gitignoreDirs, gitignorePath, gitignorePatterns, useGitignore };
}
async function normalizeSourceOptions(options: {
  projectRoot: string;
  excludeSourceExtensions?: string[];
  ignore?: CodeDisciplineIgnoreOptions;
  gitignorePath?: string;
  scanObserver?: SourceScanObserver;
}): Promise<NormalizedSourceOptions> {
  const source = options as Record<string, unknown>;
  assertLegacySourceOptionsRemoved(source);
  const projectRoot = path.resolve(options.projectRoot);
  if (!await isDirectory(projectRoot)) {
    throw new InvalidProjectRootError(projectRoot);
  }
  const sourceRootInput = DEFAULT_SOURCE_ROOT;
  const sourceRoot = resolveSourceRoot(projectRoot, sourceRootInput);
  if (!await isDirectory(sourceRoot) || !isInsideDirectory(sourceRoot, projectRoot)) {
    throw new InvalidSourceRootError(sourceRoot);
  }
  const ignore = normalizeIgnoreOptions(options);
  const { gitignoreDirs, gitignorePath, gitignorePatterns, useGitignore } = await readNormalizedGitignoreDirs(projectRoot, {
    ...options,
    ignore,
  });
  const excludedExtensions = new Set((options.excludeSourceExtensions ?? []).map(ensureDotExtension));
  const sourceExtensions = uniqueStrings(DEFAULT_SOURCE_EXTENSIONS.filter((extension) => !excludedExtensions.has(extension)));
  const ignoreEntries = normalizeExcludeDirEntries(ignore.entries, "ignore.entries");
  const excludeDirs = mergeExcludeDirEntries(
    normalizeFolderExclusionEntries(DEFAULT_EXCLUDE_DIRS),
    ignoreEntries,
    normalizeFolderExclusionEntries(gitignoreDirs),
  );
  return {
    projectRoot,
    sourceRoot,
    sourceRootRelative: normalizeRelativePath(path.relative(projectRoot, sourceRoot)),
    sourceExtensions,
    excludeDirs,
    excludeGitignoreDirs: useGitignore,
    gitignorePath,
    ignore: {
      entries: ignoreEntries,
      use_gitignore: useGitignore,
      gitignorePatterns,
    },
    scanObserver: options.scanObserver,
  };
}
export { normalizeSourceOptions };
export type { NormalizedSourceOptions };
