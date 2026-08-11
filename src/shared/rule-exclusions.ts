import path from "node:path";

import type { ExcludeDirEntry, ScannedSourceFile } from "#pkb9x3eo56l7";
import { matchesGlob } from "./globs.js";
import { isCodeDisciplineStatePath, normalizeRelativePath } from "./utils.js";

type NormalizedRuleExclusions = {
  excludeDirs?: ExcludeDirEntry[];
};

function matchesExcludedFolder(filePath: string, folderPattern: string): boolean {
  const normalizedPattern = normalizeRelativePath(folderPattern).replace(/\/+$/g, "");
  if (!normalizedPattern) return false;

  const directory = path.posix.dirname(filePath);
  const directoryParts = directory.split("/").filter(Boolean);
  if (!normalizedPattern.includes("/") && directoryParts.some((part) => matchesGlob(part, normalizedPattern))) return true;

  if (directory === normalizedPattern || directory.startsWith(`${normalizedPattern}/`)) return true;
  if (filePath === normalizedPattern || filePath.startsWith(`${normalizedPattern}/`)) return true;
  return matchesGlob(directory, normalizedPattern)
  ||matchesGlob(directory, `**/${normalizedPattern}`)
  ||matchesGlob(filePath, `${normalizedPattern}/**`)
  ||matchesGlob(filePath, `**/${normalizedPattern}/**`);
}

function isRuleExcludedFile(file: ScannedSourceFile, exclusions: NormalizedRuleExclusions): boolean {
  const relativePath = normalizeRelativePath(file.relativeFromProjectRoot);
  if (isCodeDisciplineStatePath(relativePath)) return true;
  const excludeDirs = exclusions.excludeDirs ?? [];
  return excludeDirs.some((entry) => entry.type === "file"
    ? matchesGlob(relativePath, entry.pattern)
    : matchesExcludedFolder(relativePath, entry.pattern));
}

function filterSourceFilesForRule<T extends ScannedSourceFile>(
  sourceFiles: T[],
  exclusions: NormalizedRuleExclusions | undefined,
): T[] {
  const excludeDirs = exclusions?.excludeDirs ?? [];
  if (excludeDirs.length === 0) {
    return sourceFiles;
  }

  return sourceFiles.filter((file) => !isRuleExcludedFile(file, exclusions));
}

export { filterSourceFilesForRule, isRuleExcludedFile };
export type { NormalizedRuleExclusions };
