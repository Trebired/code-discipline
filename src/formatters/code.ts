import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { loadNativeBinding } from "#q6u4pcd984qa";
import { createRuleProgress, emitRuleChunkAt, emitRuleChunkStarted, emitRuleCompleted } from "#efe33sls019o";
import type { NormalizedCheckCodeDisciplineOptions, NormalizedCodeFormatter } from "#uqbg4indzud7";
import { collectCodeFormatterFiles, collectCodeFormatterFilesFromSourceFiles, type CodeFormatterFile } from "./files.js";

type CodeFormatterMode = "check" | "fix";
type CodeFormatterBatch = {
  byteSize: number;
  files: CodeFormatterFile[];
};

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

const FORMATTER_BATCH_LIMITS = {
  maxBytes: 512 * 1024,
  maxFiles: 64,
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
    byteSize: file.byteSize,
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

function createCodeFormatterBatches(files: CodeFormatterFile[]): CodeFormatterBatch[] {
  const batches: CodeFormatterBatch[] = [];
  let batchFiles: CodeFormatterFile[] = [];
  let byteSize = 0;

  for (const file of files) {
    const nextSize = Math.max(1, file.byteSize);
    if (batchFiles.length > 0 && (batchFiles.length >= FORMATTER_BATCH_LIMITS.maxFiles || byteSize + nextSize > FORMATTER_BATCH_LIMITS.maxBytes)) {
      batches.push({ byteSize, files: batchFiles });
      batchFiles = [];
      byteSize = 0;
    }
    batchFiles.push(file);
    byteSize += nextSize;
  }

  if (batchFiles.length > 0) {
    batches.push({ byteSize, files: batchFiles });
  }
  return batches;
}

function countFormattedFiles(files: NativeFormatterFileResult[], mode: CodeFormatterMode): number {
  return mode === "fix"
  ? files.filter((file) => file.checked && file.changed && !file.error).length
  : 0;
}

async function runCodeFormatter(
  options: NormalizedCheckCodeDisciplineOptions,
  mode: CodeFormatterMode,
  sourceFiles?: ScannedSourceFile[],
): Promise<CodeFormatterResult> {
  const formatting = options.rules.formatting;
  if (!formatting) {
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

  const collected = sourceFiles
  ? await collectCodeFormatterFilesFromSourceFiles(options, formatting, sourceFiles)
  : await collectCodeFormatterFiles(options, formatting);
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

  const nativeFiles: NativeFormatterFileResult[] = [];
  try {
    let completedItems = 0;
    let chunkIndex = 0;
    for (const batch of createCodeFormatterBatches(collected.files)) {
      chunkIndex += 1;
      const extras = {
        chunkBytes: batch.byteSize,
        chunkItems: batch.files.length,
        currentFile: batch.files[0]?.relativePath,
        ...(mode === "fix" ? { rewrittenFiles: countFormattedFiles(nativeFiles, mode) } : {}),
      };
      emitRuleChunkStarted(progress, chunkIndex, completedItems, extras);
      const batchResult = parseNativeFormatterResponse(binding.formatSourceFiles(JSON.stringify({
              mode,
              options: toNativeFormatterOptions(formatting),
              sourceFiles: batch.files.map(toNativeSourceFile),
      })));
      nativeFiles.push(...batchResult.files);
      violations.push(...mapNativeResultViolations(batchResult, mode));
      completedItems += batch.files.length;
      emitRuleChunkAt(progress, chunkIndex, completedItems, violations.length, {
          ...extras,
          ...(mode === "fix" ? { rewrittenFiles: countFormattedFiles(nativeFiles, mode) } : {}),
      });
    }
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

  const nativeResult: NativeFormatterResponse = { files: nativeFiles };
  const checkedFiles = nativeResult.files.filter((file) => file.checked).length;
  const formattedFiles = countFormattedFiles(nativeResult.files, mode);
  const unchangedFiles = nativeResult.files.filter((file) => file.checked && !file.changed && !file.error).length;
  const ignoredFiles = collected.ignoredFiles + nativeResult.files.filter((file) => file.ignored).length;
  const erroredFiles = nativeResult.files.filter((file) => file.error).length + collected.violations.length;

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
