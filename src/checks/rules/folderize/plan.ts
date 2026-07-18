import path from "node:path";

import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import { supportsFolderizationFix } from "../../../shared/languages.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../progress.js";

type FolderizationCandidate = {
  absolutePath: string;
  relativeFromProjectRoot: string;
  suggestedAbsolutePath: string;
  suggestedPath: string;
  prefix: string;
  remainder: string;
  separator: string;
  mode: "same-directory-group" | "repeated-folder-prefix";
};

type PrefixMatch = {
  prefix: string;
  remainder: string;
  separator: string;
  index: number;
};

function findPrefixMatch(file: ScannedSourceFile, separators: string[]): PrefixMatch | null {
  const basename = path.basename(file.relativeFromSourceRoot, file.extension);
  let bestMatch: PrefixMatch | null = null;

  for (const separator of separators) {
    const index = basename.indexOf(separator);
    if (index <= 0) continue;

    const prefix = basename.slice(0, index);
    const remainder = basename.slice(index + separator.length);
    if (!prefix || !remainder) continue;

    if (!bestMatch || index < bestMatch.index) {
      bestMatch = { prefix, remainder, separator, index };
    }
  }

  return bestMatch;
}

function buildSuggestedPath(
  file: ScannedSourceFile,
  prefix: string,
  remainder: string,
  mode: FolderizationCandidate["mode"],
): { absolutePath: string; relativeFromProjectRoot: string } {
  const sourceDir = path.dirname(file.absolutePath);
  const projectDir = path.posix.dirname(file.relativeFromProjectRoot);
  const targetFileName = `${remainder}${file.extension}`;

  if (mode === "repeated-folder-prefix") {
    return {
      absolutePath: path.join(sourceDir, targetFileName),
      relativeFromProjectRoot: path.posix.join(projectDir, targetFileName),
    };
  }

  return {
    absolutePath: path.join(sourceDir, prefix, targetFileName),
    relativeFromProjectRoot: path.posix.join(projectDir, prefix, targetFileName),
  };
}

function planFolderizeCompoundFiles(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): FolderizationCandidate[] {
  if (!options.rules.folderizeCompoundFiles) return [];

  const separators = options.rules.folderizeCompoundFiles.separators;
  const byDirectoryAndPrefix = new Map<string, ScannedSourceFile[]>();
  const matchesByPath = new Map<string, PrefixMatch>();
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "folderize-compound-files",
    stage: "plan",
    totalItems: sourceFiles.length,
  });

  for (const file of sourceFiles) {
    if (!supportsFolderizationFix(file.extension)) continue;
    const match = findPrefixMatch(file, separators);
    if (!match) continue;

    matchesByPath.set(file.absolutePath, match);
    const directoryKey = `${path.posix.dirname(file.relativeFromSourceRoot)}::${match.prefix}`;
    const rows = byDirectoryAndPrefix.get(directoryKey) ?? [];
    rows.push(file);
    byDirectoryAndPrefix.set(directoryKey, rows);
  }

  const candidates: FolderizationCandidate[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const match = matchesByPath.get(file.absolutePath);
    if (!match) {
      emitRuleChunk(progress, index + 1, candidates.length);
      continue;
    }

    const directoryName = path.basename(path.dirname(file.absolutePath));
    const directoryKey = `${path.posix.dirname(file.relativeFromSourceRoot)}::${match.prefix}`;
    const groupedCount = byDirectoryAndPrefix.get(directoryKey)?.length ?? 0;
    const mode = directoryName === match.prefix
      ? "repeated-folder-prefix"
      : groupedCount >= 2
        ? "same-directory-group"
        : null;

    if (!mode) {
      emitRuleChunk(progress, index + 1, candidates.length);
      continue;
    }

    const suggested = buildSuggestedPath(file, match.prefix, match.remainder, mode);
    candidates.push({
      absolutePath: file.absolutePath,
      relativeFromProjectRoot: file.relativeFromProjectRoot,
      suggestedAbsolutePath: suggested.absolutePath,
      suggestedPath: suggested.relativeFromProjectRoot,
      prefix: match.prefix,
      remainder: match.remainder,
      separator: match.separator,
      mode,
    });
    emitRuleChunk(progress, index + 1, candidates.length);
  }

  emitRuleCompleted(progress, candidates.length);
  return candidates.sort((left, right) => left.relativeFromProjectRoot.localeCompare(right.relativeFromProjectRoot));
}

export { planFolderizeCompoundFiles };
export type { FolderizationCandidate };
