import fs from "node:fs/promises";
import path from "node:path";

import * as prettier from "prettier";

import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { matchesGlob } from "#49ihfa399fpp";
import { isInsideDirectory, normalizeRelativePath, toPosixPath, uniqueStrings } from "#ntve5i5a0mol";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import type { NormalizedCheckCodeDisciplineOptions, NormalizedPrettierFormatter } from "#uqbg4indzud7";

type PrettierMode = "check" | "fix";

type PrettierFile = {
  absolutePath: string;
  relativePath: string;
};

type PrettierFormatterResult = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  checked_files: number;
  formatted_files: number;
  unchanged_files: number;
  ignored_files: number;
  errored_files: number;
};

const DEFAULT_PRETTIER_IGNORE = [
  ".git",
  ".gitignore",
  "node_modules",
  ".prettierignore",
];

function normalizePatterns(patterns: string[]): string[] {
  return uniqueStrings(patterns.map((pattern) => normalizeRelativePath(pattern.trim())).filter(Boolean));
}

function resolvePrettierIgnorePatterns(
  options: NormalizedCheckCodeDisciplineOptions,
  formatter: NormalizedPrettierFormatter,
): string[] {
  const codeDisciplinePatterns = formatter.ignore
    ? [
        ...(options.ignore?.entries ?? []).map((entry) => entry.pattern),
        ...(options.ignore?.gitignorePatterns ?? []),
      ]
    : [];

  return normalizePatterns([
    ...DEFAULT_PRETTIER_IGNORE,
    ...codeDisciplinePatterns,
  ]);
}

function matchesIgnorePattern(relativePath: string, basename: string, pattern: string): boolean {
  if (!pattern.includes("/")) {
    return basename === pattern || matchesGlob(basename, pattern);
  }

  return relativePath === pattern
    || relativePath.startsWith(`${pattern}/`)
    || matchesGlob(relativePath, pattern);
}

function shouldIgnore(relativePath: string, patterns: string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  const basename = path.posix.basename(normalized);
  return patterns.some((pattern) => matchesIgnorePattern(normalized, basename, pattern));
}

function createPrettierViolation(args: {
  filePath: string;
  fix: boolean;
  message: string;
  details?: Record<string, unknown>;
}): CodeDisciplineViolation {
  return {
    rule: "prettier",
    fix: args.fix,
    filePath: args.filePath,
    message: args.message,
    details: args.details ?? {},
  };
}

async function collectDirectoryFiles(
  projectRoot: string,
  absoluteDir: string,
  ignorePatterns: string[],
  files: PrettierFile[],
): Promise<void> {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = toPosixPath(path.relative(projectRoot, absolutePath));
    if (shouldIgnore(relativePath, ignorePatterns)) continue;

    if (entry.isDirectory()) {
      await collectDirectoryFiles(projectRoot, absolutePath, ignorePatterns, files);
      continue;
    }

    if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    }
  }
}

async function collectPrettierFiles(
  options: NormalizedCheckCodeDisciplineOptions,
  formatter: NormalizedPrettierFormatter,
): Promise<{ files: PrettierFile[]; violations: CodeDisciplineViolation[] }> {
  const files: PrettierFile[] = [];
  const violations: CodeDisciplineViolation[] = [];
  const ignorePatterns = resolvePrettierIgnorePatterns(options, formatter);

  for (const target of formatter.targets) {
    const absoluteTarget = path.resolve(options.projectRoot, target);
    const relativeTarget = toPosixPath(path.relative(options.projectRoot, absoluteTarget));

    if (!isInsideDirectory(absoluteTarget, options.projectRoot) || shouldIgnore(relativeTarget, ignorePatterns)) {
      continue;
    }

    try {
      const stat = await fs.stat(absoluteTarget);
      if (stat.isDirectory()) {
        await collectDirectoryFiles(options.projectRoot, absoluteTarget, ignorePatterns, files);
        continue;
      }

      if (stat.isFile()) {
        files.push({
          absolutePath: absoluteTarget,
          relativePath: normalizeRelativePath(relativeTarget),
        });
      }
    } catch (caught) {
      violations.push(createPrettierViolation({
        filePath: normalizeRelativePath(relativeTarget) || target,
        fix: false,
        message: `target could not be read: ${caught instanceof Error ? caught.message : String(caught)}`,
      }));
    }
  }

  return {
    files: uniqueFiles(files),
    violations,
  };
}

function uniqueFiles(files: PrettierFile[]): PrettierFile[] {
  const seen = new Set<string>();
  const result: PrettierFile[] = [];

  for (const file of files) {
    if (seen.has(file.absolutePath)) continue;
    seen.add(file.absolutePath);
    result.push(file);
  }

  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function isSupportedByPrettier(
  file: PrettierFile,
  formatter: NormalizedPrettierFormatter,
): Promise<boolean> {
  const info = await prettier.getFileInfo(file.absolutePath, {
    plugins: formatter.options.plugins,
    resolveConfig: false,
    withNodeModules: false,
  });

  return !info.ignored && Boolean(info.inferredParser || formatter.options.parser);
}

async function runPrettierOnFile(
  file: PrettierFile,
  formatter: NormalizedPrettierFormatter,
  mode: PrettierMode,
): Promise<{ changed: boolean; violation?: CodeDisciplineViolation }> {
  try {
    const source = await fs.readFile(file.absolutePath, "utf8");
    const formatted = await prettier.format(source, {
      ...formatter.options,
      filepath: file.absolutePath,
    });
    const changed = formatted !== source;

    if (mode === "fix" && changed) {
      await fs.writeFile(file.absolutePath, formatted, "utf8");
    }

    return {
      changed,
      violation: mode === "check" && changed
        ? createPrettierViolation({
            filePath: file.relativePath,
            fix: true,
            message: "needs formatting",
            details: { formatter: "prettier" },
          })
        : undefined,
    };
  } catch (caught) {
    return {
      changed: false,
      violation: createPrettierViolation({
        filePath: file.relativePath,
        fix: mode === "fix",
        message: `failed to ${mode === "fix" ? "format" : "check"}: ${caught instanceof Error ? caught.message : String(caught)}`,
        details: { formatter: "prettier" },
      }),
    };
  }
}

async function runPrettierFormatter(
  options: NormalizedCheckCodeDisciplineOptions,
  mode: PrettierMode,
): Promise<PrettierFormatterResult> {
  const formatter = options.formatters.prettier;
  if (!formatter) {
    return {
      ok: true,
      violationCount: 0,
      violations: [],
      checked_files: 0,
      formatted_files: 0,
      unchanged_files: 0,
      ignored_files: 0,
      errored_files: 0,
    };
  }

  const collected = await collectPrettierFiles(options, formatter);
  const violations = [...collected.violations];
  let checkedFiles = 0;
  let formattedFiles = 0;
  let unchangedFiles = 0;
  let ignoredFiles = 0;
  let erroredFiles = violations.length;
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "prettier",
    stage: mode,
    totalItems: collected.files.length,
  });

  for (let index = 0; index < collected.files.length; index += 1) {
    const file = collected.files[index]!;
    let supported = false;
    try {
      supported = await isSupportedByPrettier(file, formatter);
    } catch (caught) {
      violations.push(createPrettierViolation({
        filePath: file.relativePath,
        fix: false,
        message: `failed to inspect: ${caught instanceof Error ? caught.message : String(caught)}`,
        details: { formatter: "prettier" },
      }));
      erroredFiles += 1;
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    if (!supported) {
      ignoredFiles += 1;
      emitRuleChunk(progress, index + 1, violations.length);
      continue;
    }

    checkedFiles += 1;
    const result = await runPrettierOnFile(file, formatter, mode);

    if (result.violation) {
      violations.push(result.violation);
      if (result.violation.message.startsWith("failed to ")) {
        erroredFiles += 1;
      }
    }

    if (result.changed) {
      formattedFiles += mode === "fix" ? 1 : 0;
    } else if (!result.violation || !result.violation.message.startsWith("failed to ")) {
      unchangedFiles += 1;
    }

    emitRuleChunk(progress, index + 1, violations.length, mode === "fix" ? {
      rewrittenFiles: formattedFiles,
    } : {});
  }

  emitRuleCompleted(progress, violations.length, mode === "fix" ? {
    rewrittenFiles: formattedFiles,
  } : {});

  return {
    ok: violations.length === 0,
    violationCount: violations.length,
    violations,
    checked_files: checkedFiles,
    formatted_files: formattedFiles,
    unchanged_files: unchangedFiles,
    ignored_files: ignoredFiles,
    errored_files: erroredFiles,
  };
}

export { runPrettierFormatter };
export type { PrettierFormatterResult };
