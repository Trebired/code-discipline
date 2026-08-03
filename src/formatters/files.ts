import fs from "node:fs/promises";
import path from "node:path";

import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { DEFAULT_EXCLUDE_DIRS } from "#ik5y0pee4ah1";
import { matchesGlob } from "#49ihfa399fpp";
import { supportsFormatter } from "#87jyjzn68rrk";
import { isInsideDirectory, normalizeRelativePath, toPosixPath, uniqueStrings } from "#ntve5i5a0mol";
import type { NormalizedCheckCodeDisciplineOptions, NormalizedCodeFormatter } from "#uqbg4indzud7";

type CodeFormatterFile = {
  absolutePath: string;
  relativePath: string;
  extension: string;
};

const DEFAULT_FORMATTER_IGNORE = DEFAULT_EXCLUDE_DIRS;

function normalizePatterns(patterns: string[]): string[] {
  return uniqueStrings(patterns
    .map((pattern) => normalizeRelativePath(pattern.trim()).replace(/\/+$/g, ""))
    .filter(Boolean));
}

function resolveFormatterIgnorePatterns(
  options: NormalizedCheckCodeDisciplineOptions,
  formatter: NormalizedCodeFormatter,
): string[] {
  const codeDisciplinePatterns = formatter.ignore
    ? [
        ...(options.ignore?.entries ?? []).map((entry) => entry.pattern),
        ...(options.ignore?.gitignorePatterns ?? []),
      ]
    : [];

  return normalizePatterns([
    ...DEFAULT_FORMATTER_IGNORE,
    ...codeDisciplinePatterns,
  ]);
}

function matchesIgnorePattern(relativePath: string, basename: string, pattern: string): boolean {
  if (!pattern.includes("/")) {
    return basename === pattern || matchesGlob(basename, pattern);
  }

  return relativePath === pattern
    || relativePath.startsWith(`${pattern}/`)
    || matchesGlob(relativePath, pattern)
    || matchesGlob(relativePath, `${pattern}/**`);
}

function shouldIgnore(relativePath: string, patterns: string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const basename = path.posix.basename(normalized);
  return patterns.some((pattern) => matchesIgnorePattern(normalized, basename, pattern));
}

function createTargetReadViolation(args: {
  filePath: string;
  message: string;
}): CodeDisciplineViolation {
  return {
    rule: "format",
    fix: false,
    filePath: args.filePath,
    message: args.message,
    details: {},
  };
}

function isSupportedFormatterFile(file: CodeFormatterFile, options: NormalizedCheckCodeDisciplineOptions): boolean {
  if (!options.sourceExtensions.includes(file.extension.toLowerCase())) return false;
  return supportsFormatter(file.extension);
}

async function collectDirectoryFiles(
  options: NormalizedCheckCodeDisciplineOptions,
  absoluteDir: string,
  ignorePatterns: string[],
  files: CodeFormatterFile[],
): Promise<number> {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  let ignoredFiles = 0;

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = toPosixPath(path.relative(options.projectRoot, absolutePath));
    if (shouldIgnore(relativePath, ignorePatterns)) continue;

    if (entry.isDirectory()) {
      ignoredFiles += await collectDirectoryFiles(options, absolutePath, ignorePatterns, files);
      continue;
    }

    if (!entry.isFile()) continue;

    const file = {
      absolutePath,
      relativePath: normalizeRelativePath(relativePath),
      extension: path.extname(entry.name).toLowerCase(),
    };
    if (isSupportedFormatterFile(file, options)) {
      files.push(file);
    } else {
      ignoredFiles += 1;
    }
  }

  return ignoredFiles;
}

async function collectCodeFormatterFiles(
  options: NormalizedCheckCodeDisciplineOptions,
  formatter: NormalizedCodeFormatter,
): Promise<{ files: CodeFormatterFile[]; ignoredFiles: number; violations: CodeDisciplineViolation[] }> {
  const files: CodeFormatterFile[] = [];
  const violations: CodeDisciplineViolation[] = [];
  const ignorePatterns = resolveFormatterIgnorePatterns(options, formatter);
  let ignoredFiles = 0;

  for (const target of formatter.targets) {
    const absoluteTarget = path.resolve(options.projectRoot, target);
    const relativeTarget = normalizeRelativePath(toPosixPath(path.relative(options.projectRoot, absoluteTarget)));

    if (!isInsideDirectory(absoluteTarget, options.projectRoot) || shouldIgnore(relativeTarget, ignorePatterns)) {
      continue;
    }

    try {
      const stat = await fs.stat(absoluteTarget);
      if (stat.isDirectory()) {
        ignoredFiles += await collectDirectoryFiles(options, absoluteTarget, ignorePatterns, files);
        continue;
      }

      if (stat.isFile()) {
        const file = {
          absolutePath: absoluteTarget,
          relativePath: relativeTarget,
          extension: path.extname(absoluteTarget).toLowerCase(),
        };
        if (isSupportedFormatterFile(file, options)) {
          files.push(file);
        } else {
          ignoredFiles += 1;
        }
      }
    } catch (caught) {
      violations.push(createTargetReadViolation({
        filePath: relativeTarget || target,
        message: `target could not be read: ${caught instanceof Error ? caught.message : String(caught)}`,
      }));
    }
  }

  return {
    files: uniqueFiles(files),
    ignoredFiles,
    violations,
  };
}

function uniqueFiles(files: CodeFormatterFile[]): CodeFormatterFile[] {
  const seen = new Set<string>();
  const result: CodeFormatterFile[] = [];

  for (const file of files) {
    if (seen.has(file.absolutePath)) continue;
    seen.add(file.absolutePath);
    result.push(file);
  }

  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export { collectCodeFormatterFiles };
export type { CodeFormatterFile };
