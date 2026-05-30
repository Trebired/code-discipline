import path from "node:path";

import { DEFAULT_EXCLUDE_DIRS, DEFAULT_SOURCE_EXTENSIONS, DEFAULT_SOURCE_ROOT } from "../shared/constants.js";
import { InvalidProjectRootError, InvalidSourceRootError } from "../shared/errors.js";
import { ensureDotExtension, isDirectory, isInsideDirectory, normalizeRelativePath, uniqueStrings } from "../shared/utils.js";

type NormalizedSourceOptions = {
  projectRoot: string;
  sourceRoot: string;
  sourceRootRelative: string;
  sourceExtensions: string[];
  excludeDirs: string[];
};

async function normalizeSourceOptions(options: {
  projectRoot: string;
  sourceRoot?: string;
  sourceExtensions?: string[];
  excludeDirs?: string[];
}): Promise<NormalizedSourceOptions> {
  const projectRoot = path.resolve(options.projectRoot);
  if (!await isDirectory(projectRoot)) {
    throw new InvalidProjectRootError(projectRoot);
  }

  const sourceRootInput = options.sourceRoot ?? DEFAULT_SOURCE_ROOT;
  const sourceRoot = path.isAbsolute(sourceRootInput) ? path.resolve(sourceRootInput) : path.resolve(projectRoot, sourceRootInput);
  if (!await isDirectory(sourceRoot) || !isInsideDirectory(sourceRoot, projectRoot)) {
    throw new InvalidSourceRootError(sourceRoot);
  }

  return {
    projectRoot,
    sourceRoot,
    sourceRootRelative: normalizeRelativePath(path.relative(projectRoot, sourceRoot)),
    sourceExtensions: uniqueStrings((options.sourceExtensions ?? DEFAULT_SOURCE_EXTENSIONS).map(ensureDotExtension)),
    excludeDirs: uniqueStrings(options.excludeDirs ?? DEFAULT_EXCLUDE_DIRS),
  };
}

export { normalizeSourceOptions };
export type { NormalizedSourceOptions };
