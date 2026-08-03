import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "#efe33sls019o";
import type { NormalizedCheckCodeDisciplineOptions, NormalizedCodeFormatter } from "#uqbg4indzud7";
import { collectCodeFormatterFiles, type CodeFormatterFile } from "./files.js";

type CodeFormatterMode = "check" | "fix";

type NativeFormatterFileResult = {
  filePath: string;
  checked: boolean;
  changed: boolean;
  ignored: boolean;
  error?: string;
};

type NativeFormatterResponse = {
  files: NativeFormatterFileResult[];
};

type CodeFormatterResult = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  checked_files: number;
  formatted_files: number;
  unchanged_files: number;
  ignored_files: number;
  errored_files: number;
};

function createFormatViolation(args: {
  filePath: string;
  fix: boolean;
  message: string;
  details?: Record<string, unknown>;
}): CodeDisciplineViolation {
  return {
    rule: "format",
    fix: args.fix,
    filePath: args.filePath,
    message: args.message,
    details: args.details ?? {},
  };
}

function toNativeSourceFile(file: CodeFormatterFile) {
  return {
    absolutePath: file.absolutePath,
    relativeFromProjectRoot: file.relativePath,
    relativeFromSourceRoot: file.relativePath,
    extension: file.extension,
  };
}

function toNativeFormatterOptions(formatter: NormalizedCodeFormatter): Record<string, unknown> {
  return {
    maxCharactersPerLine: formatter.maxCharactersPerLine,
    indentWidth: formatter.indentWidth,
    finalNewline: formatter.finalNewline,
    trimTrailingWhitespace: formatter.trimTrailingWhitespace,
    collapseBlankLines: formatter.collapseBlankLines,
  };
}

function createNativeUnavailableViolation(mode: CodeFormatterMode): CodeDisciplineViolation {
  return createFormatViolation({
    filePath: ".",
    fix: mode === "fix",
    message: "native formatter backend is unavailable",
    details: { formatter: "code", backend: "native" },
  });
}

function createNativeErrorViolation(error: unknown, mode: CodeFormatterMode): CodeDisciplineViolation {
  return createFormatViolation({
    filePath: ".",
    fix: mode === "fix",
    message: `native formatter failed: ${error instanceof Error ? error.message : String(error)}`,
    details: { formatter: "code", backend: "native" },
  });
}

function parseNativeFormatterResponse(value: string): NativeFormatterResponse {
  const parsed = JSON.parse(value) as NativeFormatterResponse;
  return {
    files: Array.isArray(parsed.files) ? parsed.files : [],
  };
}

function mapNativeResultViolations(
  result: NativeFormatterResponse,
  mode: CodeFormatterMode,
): CodeDisciplineViolation[] {
  const violations: CodeDisciplineViolation[] = [];

  for (const file of result.files) {
    if (file.error) {
      violations.push(createFormatViolation({
        filePath: file.filePath,
        fix: mode === "fix",
        message: `failed to ${mode === "fix" ? "format" : "check"}: ${file.error}`,
        details: { formatter: "code", backend: "native" },
      }));
      continue;
    }

    if (mode === "check" && file.changed) {
      violations.push(createFormatViolation({
        filePath: file.filePath,
        fix: true,
        message: "needs formatting",
        details: { formatter: "code", backend: "native" },
      }));
    }
  }

  return violations;
}

async function runCodeFormatter(
  options: NormalizedCheckCodeDisciplineOptions,
  mode: CodeFormatterMode,
): Promise<CodeFormatterResult> {
  const formatter = options.formatters.code;
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

  const collected = await collectCodeFormatterFiles(options, formatter);
  const violations = [...collected.violations];
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "format",
    stage: mode,
    totalItems: collected.files.length,
  });
  const binding = loadNativeBinding();

  if (!binding?.formatSourceFiles) {
    violations.push(createNativeUnavailableViolation(mode));
    emitRuleCompleted(progress, violations.length);
    return {
      ok: false,
      violationCount: violations.length,
      violations,
      checked_files: 0,
      formatted_files: 0,
      unchanged_files: 0,
      ignored_files: collected.ignoredFiles,
      errored_files: violations.length,
    };
  }

  let nativeResult: NativeFormatterResponse;
  try {
    nativeResult = parseNativeFormatterResponse(binding.formatSourceFiles(JSON.stringify({
      mode,
      options: toNativeFormatterOptions(formatter),
      sourceFiles: collected.files.map(toNativeSourceFile),
    })));
  } catch (caught) {
    violations.push(createNativeErrorViolation(caught, mode));
    emitRuleCompleted(progress, violations.length);
    return {
      ok: false,
      violationCount: violations.length,
      violations,
      checked_files: 0,
      formatted_files: 0,
      unchanged_files: 0,
      ignored_files: collected.ignoredFiles,
      errored_files: violations.length,
    };
  }

  violations.push(...mapNativeResultViolations(nativeResult, mode));
  const checkedFiles = nativeResult.files.filter((file) => file.checked).length;
  const formattedFiles = mode === "fix" ? nativeResult.files.filter((file) => file.checked && file.changed && !file.error).length : 0;
  const unchangedFiles = nativeResult.files.filter((file) => file.checked && !file.changed && !file.error).length;
  const ignoredFiles = collected.ignoredFiles + nativeResult.files.filter((file) => file.ignored).length;
  const erroredFiles = nativeResult.files.filter((file) => file.error).length + collected.violations.length;

  emitRuleChunk(progress, collected.files.length, violations.length, mode === "fix" ? {
    rewrittenFiles: formattedFiles,
  } : {});
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

export { runCodeFormatter };
export type { CodeFormatterResult };
