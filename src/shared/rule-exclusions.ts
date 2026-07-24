import path from "node:path";

import type { ScannedSourceFile } from "../imports/types.js";
import { matchesGlob } from "./globs.js";
import { normalizeRelativePath } from "./utils.js";

type NormalizedRuleExclusions = {
  excludeFiles?: string[];
  excludeFolders?: string[];
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
    || matchesGlob(directory, `**/${normalizedPattern}`)
    || matchesGlob(filePath, `${normalizedPattern}/**`)
    || matchesGlob(filePath, `**/${normalizedPattern}/**`);
}

function isRuleExcludedFile(file: ScannedSourceFile, exclusions: NormalizedRuleExclusions): boolean {
  const relativePath = normalizeRelativePath(file.relativeFromProjectRoot);
  const excludeFiles = exclusions.excludeFiles ?? [];
  const excludeFolders = exclusions.excludeFolders ?? [];
  return excludeFiles.some((pattern) => matchesGlob(relativePath, pattern))
    || excludeFolders.some((pattern) => matchesExcludedFolder(relativePath, pattern));
}

function filterSourceFilesForRule<T extends ScannedSourceFile>(
  sourceFiles: T[],
  exclusions: NormalizedRuleExclusions | undefined,
): T[] {
  const excludeFiles = exclusions?.excludeFiles ?? [];
  const excludeFolders = exclusions?.excludeFolders ?? [];
  if (excludeFiles.length === 0 && excludeFolders.length === 0) {
    return sourceFiles;
  }

  return sourceFiles.filter((file) => !isRuleExcludedFile(file, exclusions));
}

export { filterSourceFilesForRule, isRuleExcludedFile };
export type { NormalizedRuleExclusions };
