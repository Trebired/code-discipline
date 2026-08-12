import fs from "node:fs/promises";
import path from "node:path";

import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { DEFAULT_EXCLUDE_DIRS } from "#ik5y0pee4ah1";
import { globToRegExp } from "#49ihfa399fpp";
import { supportsFormatter } from "#87jyjzn68rrk";
import { isInsideDirectory, normalizeRelativePath, toPosixPath, uniqueStrings } from "#ntve5i5a0mol";
import type { NormalizedCheckCodeDisciplineOptions, NormalizedFormattingRule } from "#uqbg4indzud7";

type CodeFormatterFile = {
  absolutePath: string;
  byteSize: number;
  relativePath: string;
  extension: string;
};
type CodeFormatterTarget = {
  absolutePath: string;
  directory: boolean;
  file: boolean;
  relativePath: string;
};
type FormatterTargetMatcher = {
  filePaths: Set<string>;
  directoryPaths: string[];
};
type IgnoreMatcher = {
  basenamePatterns: Set<string>;
  basenameGlobs: RegExp[];
  pathPatterns: Set<string>;
  pathPrefixes: string[];
  pathGlobs: RegExp[];
};

const DEFAULT_FORMATTER_IGNORE = DEFAULT_EXCLUDE_DIRS;

function normalizePatterns(patterns: string[]): string[] {
  return uniqueStrings(patterns
    .map((pattern) => normalizeRelativePath(pattern.trim()).replace(/\/+$/g, ""))
    .filter(Boolean));
}

function resolveFormatterIgnorePatterns(
  options: NormalizedCheckCodeDisciplineOptions,
  formatter: NormalizedFormattingRule,
): string[] {
  const codeDisciplinePatterns = formatter.ignore
  ? [
    ...(options.ignore?.entries ?? []).map((entry) => entry.pattern),
    ...(options.ignore?.gitignorePatterns ?? []),
  ]
  : [];
  const formatterPatterns = formatter.excludeDirs.map((entry) => entry.pattern);

  return normalizePatterns([
      ...DEFAULT_FORMATTER_IGNORE,
      ...codeDisciplinePatterns,
      ...formatterPatterns,
  ]);
}

function hasGlobSyntax(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function createIgnoreMatcher(patterns: string[]): IgnoreMatcher {
  const matcher: IgnoreMatcher = {
    basenamePatterns: new Set(),
    basenameGlobs: [],
    pathPatterns: new Set(),
    pathPrefixes: [],
    pathGlobs: [],
  };

  for (const pattern of patterns) {
    if (!pattern.includes("/")) {
      if (hasGlobSyntax(pattern)) {
        matcher.basenameGlobs.push(globToRegExp(pattern));
      } else {
        matcher.basenamePatterns.add(pattern);
      }
      continue;
    }

    if (hasGlobSyntax(pattern)) {
      matcher.pathGlobs.push(globToRegExp(pattern), globToRegExp(`${pattern}/**`));
    } else {
      matcher.pathPatterns.add(pattern);
      matcher.pathPrefixes.push(`${pattern}/`);
    }
  }

  return matcher;
}

function shouldIgnore(relativePath: string, matcher: IgnoreMatcher): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const basename = path.posix.basename(normalized);
  if (matcher.basenamePatterns.has(basename) || matcher.pathPatterns.has(normalized)) {
    return true;
  }
  if (matcher.pathPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }
  if (matcher.basenameGlobs.some((pattern) => pattern.test(basename))) {
    return true;
  }
  return matcher.pathGlobs.some((pattern) => pattern.test(normalized));
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

function createFormatterTargetMatcher(targets: CodeFormatterTarget[]): FormatterTargetMatcher {
  return {
    filePaths: new Set(targets.filter((target) => target.file).map((target) => target.absolutePath)),
    directoryPaths: targets.filter((target) => target.directory).map((target) => `${target.absolutePath}${path.sep}`),
  };
}

function matchesFormatterTargets(file: CodeFormatterFile, matcher: FormatterTargetMatcher): boolean {
  return matcher.filePaths.has(file.absolutePath)
  ||matcher.directoryPaths.some((directoryPath) => `${file.absolutePath}${path.sep}`.startsWith(directoryPath));
}

function sourceFileToFormatterFile(file: ScannedSourceFile): CodeFormatterFile {
  return {
    absolutePath: file.absolutePath,
    byteSize: file.byteSize ?? 0,
    extension: file.extension,
    relativePath: file.relativeFromProjectRoot,
  };
}

async function collectDirectoryFiles(
  options: NormalizedCheckCodeDisciplineOptions,
  absoluteDir: string,
  ignoreMatcher: IgnoreMatcher,
  files: CodeFormatterFile[],
): Promise<number> {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  let ignoredFiles = 0;

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = toPosixPath(path.relative(options.projectRoot, absolutePath));
    if (shouldIgnore(relativePath, ignoreMatcher)) continue;

    if (entry.isDirectory()) {
      ignoredFiles += await collectDirectoryFiles(options, absolutePath, ignoreMatcher, files);
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = await fs.stat(absolutePath);

    const file = {
      absolutePath,
      byteSize: stat.size,
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
  formatter: NormalizedFormattingRule,
): Promise<{files:CodeFormatterFile[];ignoredFiles:number;violations:CodeDisciplineViolation[]}> {
  const files: CodeFormatterFile[] = [];
  const violations: CodeDisciplineViolation[] = [];
  const ignoreMatcher = createIgnoreMatcher(resolveFormatterIgnorePatterns(options, formatter));
  let ignoredFiles = 0;

  for (const target of formatter.targets) {
    const absoluteTarget = path.resolve(options.projectRoot, target);
    const relativeTarget = normalizeRelativePath(toPosixPath(path.relative(options.projectRoot, absoluteTarget)));

    if (!isInsideDirectory(absoluteTarget, options.projectRoot) || shouldIgnore(relativeTarget, ignoreMatcher)) {
      continue;
    }

    try {
      const stat = await fs.stat(absoluteTarget);
      if (stat.isDirectory()) {
        ignoredFiles += await collectDirectoryFiles(options, absoluteTarget, ignoreMatcher, files);
        continue;
      }

      if (stat.isFile()) {
        const file = {
          absolutePath: absoluteTarget,
          byteSize: stat.size,
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

async function collectCodeFormatterFilesFromSourceFiles(
  options: NormalizedCheckCodeDisciplineOptions,
  formatter: NormalizedFormattingRule,
  sourceFiles: ScannedSourceFile[],
): Promise<{files:CodeFormatterFile[];ignoredFiles:number;violations:CodeDisciplineViolation[]}> {
  const files: CodeFormatterFile[] = [];
  const violations: CodeDisciplineViolation[] = [];
  const targets: CodeFormatterTarget[] = [];
  const ignoreMatcher = createIgnoreMatcher(resolveFormatterIgnorePatterns(options, formatter));
  let ignoredFiles = 0;

  for (const target of formatter.targets) {
    const absoluteTarget = path.resolve(options.projectRoot, target);
    const relativeTarget = normalizeRelativePath(toPosixPath(path.relative(options.projectRoot, absoluteTarget)));

    if (!isInsideDirectory(absoluteTarget, options.projectRoot) || shouldIgnore(relativeTarget, ignoreMatcher)) {
      continue;
    }

    try {
      const stat = await fs.stat(absoluteTarget);
      targets.push({
          absolutePath: absoluteTarget,
          directory: stat.isDirectory(),
          file: stat.isFile(),
          relativePath: relativeTarget,
      });
    } catch (caught) {
      violations.push(createTargetReadViolation({
            filePath: relativeTarget || target,
            message: `target could not be read: ${caught instanceof Error ? caught.message : String(caught)}`,
      }));
    }
  }

  const targetMatcher = createFormatterTargetMatcher(targets);

  for (const sourceFile of sourceFiles) {
    const file = sourceFileToFormatterFile(sourceFile);
    if (!matchesFormatterTargets(file, targetMatcher)) {
      continue;
    }
    if (shouldIgnore(file.relativePath, ignoreMatcher)) {
      continue;
    }
    if (isSupportedFormatterFile(file, options)) {
      files.push(file);
    } else {
      ignoredFiles += 1;
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

export { collectCodeFormatterFiles, collectCodeFormatterFilesFromSourceFiles };
export type { CodeFormatterFile };
