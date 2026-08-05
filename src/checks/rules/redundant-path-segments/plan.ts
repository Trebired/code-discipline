import path from "node:path";

import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { supportsRedundantPathSegmentsFix } from "#87jyjzn68rrk";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";

type RedundantPathSegmentsCandidate = {
  absolutePath: string;
  relativeFromProjectRoot: string;
  suggestedAbsolutePath: string;
  suggestedPath: string;
  prefix: string;
  remainder: string;
  pathSegment?: string;
  separator: string;
  mode: "redundant-path-segment" | "same-directory-group" | "repeated-folder-prefix";
};

type PrefixMatch = {
  prefix: string;
  remainder: string;
  separator: string;
  index: number;
  pathSegment?: string;
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

function normalizePathSegmentToken(value: string): string {
  return value.toLowerCase().replace(/[_\-\s]+/gu, "");
}

function singularizePathSegmentToken(value: string): string {
  const normalized = normalizePathSegmentToken(value);
  return normalized.length > 1 && normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
}

function pathSegmentTokenMap(file: ScannedSourceFile): Map<string, string> {
  const directory = path.posix.dirname(file.relativeFromSourceRoot);
  const tokens = new Map<string, string>();

  if (!directory || directory === ".") return tokens;

  for (const segment of directory.split("/")) {
    if (!segment || segment === ".") continue;
    const token = singularizePathSegmentToken(segment);
    if (!token || tokens.has(token)) continue;
    tokens.set(token, segment);
  }

  return tokens;
}

function findRedundantPathSegmentMatch(
  file: ScannedSourceFile,
  separators: string[],
): PrefixMatch | null {
  const basename = path.basename(file.relativeFromSourceRoot, file.extension);
  const pathSegmentTokens = pathSegmentTokenMap(file);
  let bestMatch: PrefixMatch | null = null;

  for (const separator of separators) {
    const index = basename.lastIndexOf(separator);
    if (index <= 0) continue;

    const prefix = basename.slice(0, index);
    const remainder = basename.slice(index + separator.length);
    if (!prefix || !remainder) continue;

    const pathSegment = pathSegmentTokens.get(singularizePathSegmentToken(remainder));
    if (!pathSegment) continue;

    if (!bestMatch || index > bestMatch.index) {
      bestMatch = {
        prefix,
        remainder,
        separator,
        index,
        pathSegment,
      };
    }
  }

  return bestMatch;
}

function buildSuggestedPath(
  file: ScannedSourceFile,
  prefix: string,
  remainder: string,
  mode: RedundantPathSegmentsCandidate["mode"],
): { absolutePath: string; relativeFromProjectRoot: string } {
  const sourceDir = path.dirname(file.absolutePath);
  const projectDir = path.posix.dirname(file.relativeFromProjectRoot);
  const targetFileName = `${mode === "redundant-path-segment" ? prefix : remainder}${file.extension}`;

  if (mode === "repeated-folder-prefix" || mode === "redundant-path-segment") {
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

function planRedundantPathSegments(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): RedundantPathSegmentsCandidate[] {
  if (!options.rules.redundantPathSegments) return [];

  const separators = options.rules.redundantPathSegments.separators;
  const byDirectoryAndPrefix = new Map<string, ScannedSourceFile[]>();
  const matchesByPath = new Map<string, PrefixMatch>();
  const pathSegmentMatchesByPath = new Map<string, PrefixMatch>();
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "redundant-path-segments",
    stage: "plan",
    totalItems: sourceFiles.length,
  });

  for (const file of sourceFiles) {
    if (!supportsRedundantPathSegmentsFix(file.extension)) continue;
    const pathSegmentMatch = findRedundantPathSegmentMatch(file, separators);
    if (pathSegmentMatch) {
      pathSegmentMatchesByPath.set(file.absolutePath, pathSegmentMatch);
    }

    const match = findPrefixMatch(file, separators);
    if (!match) continue;

    matchesByPath.set(file.absolutePath, match);
    const directoryKey = `${path.posix.dirname(file.relativeFromSourceRoot)}::${match.prefix}`;
    const rows = byDirectoryAndPrefix.get(directoryKey) ?? [];
    rows.push(file);
    byDirectoryAndPrefix.set(directoryKey, rows);
  }

  const candidates: RedundantPathSegmentsCandidate[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const pathSegmentMatch = pathSegmentMatchesByPath.get(file.absolutePath);
    if (pathSegmentMatch) {
      const suggested = buildSuggestedPath(file, pathSegmentMatch.prefix, pathSegmentMatch.remainder, "redundant-path-segment");
      candidates.push({
        absolutePath: file.absolutePath,
        relativeFromProjectRoot: file.relativeFromProjectRoot,
        suggestedAbsolutePath: suggested.absolutePath,
        suggestedPath: suggested.relativeFromProjectRoot,
        prefix: pathSegmentMatch.prefix,
        remainder: pathSegmentMatch.remainder,
        pathSegment: pathSegmentMatch.pathSegment,
        separator: pathSegmentMatch.separator,
        mode: "redundant-path-segment",
      });
      emitRuleChunk(progress, index + 1, candidates.length);
      continue;
    }

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

export { planRedundantPathSegments };
export type { RedundantPathSegmentsCandidate };
