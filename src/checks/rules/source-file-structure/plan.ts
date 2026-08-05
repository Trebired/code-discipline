import path from "node:path";

import type { NormalizedCheckCodeDisciplineOptions } from "#uqbg4indzud7";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { supportsSourceFileStructureFix } from "#87jyjzn68rrk";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";

type SourceFileStructureCandidate = {
  absolutePath: string;
  relativeFromProjectRoot: string;
  suggestedAbsolutePath: string;
  suggestedPath: string;
  prefix: string;
  remainder: string;
  roleSuffix?: string;
  separator: string;
  mode: "redundant-role-suffix" | "same-directory-group" | "repeated-folder-prefix";
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

function normalizeRoleToken(value: string): string {
  return value.toLowerCase().replace(/[_\-\s]+/gu, "");
}

function directoryMatchesRoleSuffix(directoryName: string, roleSuffix: string): boolean {
  const normalizedDirectory = normalizeRoleToken(directoryName);
  const normalizedSuffix = normalizeRoleToken(roleSuffix);
  return normalizedDirectory === normalizedSuffix || normalizedDirectory === `${normalizedSuffix}s`;
}

function findRedundantRoleSuffixMatch(
  file: ScannedSourceFile,
  separators: string[],
  roleSuffixes: string[],
): PrefixMatch | null {
  const basename = path.basename(file.relativeFromSourceRoot, file.extension);
  const directoryName = path.basename(path.dirname(file.relativeFromSourceRoot));
  let bestMatch: PrefixMatch | null = null;

  for (const roleSuffix of roleSuffixes) {
    if (!directoryMatchesRoleSuffix(directoryName, roleSuffix)) continue;

    for (const separator of separators) {
      const suffixToken = `${separator}${roleSuffix}`;
      if (!basename.toLowerCase().endsWith(suffixToken.toLowerCase())) continue;

      const prefix = basename.slice(0, -suffixToken.length);
      if (!prefix) continue;

      const index = basename.length - suffixToken.length;
      if (!bestMatch || suffixToken.length > bestMatch.separator.length + bestMatch.remainder.length) {
        bestMatch = {
          prefix,
          remainder: roleSuffix,
          separator,
          index,
        };
      }
    }
  }

  return bestMatch;
}

function buildSuggestedPath(
  file: ScannedSourceFile,
  prefix: string,
  remainder: string,
  mode: SourceFileStructureCandidate["mode"],
): { absolutePath: string; relativeFromProjectRoot: string } {
  const sourceDir = path.dirname(file.absolutePath);
  const projectDir = path.posix.dirname(file.relativeFromProjectRoot);
  const targetFileName = `${mode === "redundant-role-suffix" ? prefix : remainder}${file.extension}`;

  if (mode === "repeated-folder-prefix" || mode === "redundant-role-suffix") {
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

function planSourceFileStructure(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): SourceFileStructureCandidate[] {
  if (!options.rules.sourceFileStructure) return [];

  const separators = options.rules.sourceFileStructure.separators;
  const roleSuffixes = options.rules.sourceFileStructure.roleSuffixes;
  const byDirectoryAndPrefix = new Map<string, ScannedSourceFile[]>();
  const matchesByPath = new Map<string, PrefixMatch>();
  const roleSuffixMatchesByPath = new Map<string, PrefixMatch>();
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "source-file-structure",
    stage: "plan",
    totalItems: sourceFiles.length,
  });

  for (const file of sourceFiles) {
    if (!supportsSourceFileStructureFix(file.extension)) continue;
    const roleSuffixMatch = findRedundantRoleSuffixMatch(file, separators, roleSuffixes);
    if (roleSuffixMatch) {
      roleSuffixMatchesByPath.set(file.absolutePath, roleSuffixMatch);
    }

    const match = findPrefixMatch(file, separators);
    if (!match) continue;

    matchesByPath.set(file.absolutePath, match);
    const directoryKey = `${path.posix.dirname(file.relativeFromSourceRoot)}::${match.prefix}`;
    const rows = byDirectoryAndPrefix.get(directoryKey) ?? [];
    rows.push(file);
    byDirectoryAndPrefix.set(directoryKey, rows);
  }

  const candidates: SourceFileStructureCandidate[] = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    const roleSuffixMatch = roleSuffixMatchesByPath.get(file.absolutePath);
    if (roleSuffixMatch) {
      const suggested = buildSuggestedPath(file, roleSuffixMatch.prefix, roleSuffixMatch.remainder, "redundant-role-suffix");
      candidates.push({
        absolutePath: file.absolutePath,
        relativeFromProjectRoot: file.relativeFromProjectRoot,
        suggestedAbsolutePath: suggested.absolutePath,
        suggestedPath: suggested.relativeFromProjectRoot,
        prefix: roleSuffixMatch.prefix,
        remainder: roleSuffixMatch.remainder,
        roleSuffix: roleSuffixMatch.remainder,
        separator: roleSuffixMatch.separator,
        mode: "redundant-role-suffix",
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

export { planSourceFileStructure };
export type { SourceFileStructureCandidate };
