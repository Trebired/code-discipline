import { performance } from "node:perf_hooks";
import type {
  ScannedSourceFile,
  SourceScanBackend,
  SourceScanCompletedEvent,
  SourceScanStageEvent,
  SourceScanStartedEvent,
  SourceScanOptions,
} from "./types.js";
import { requireNativeBinding } from "#q6u4pcd984qa";

type NativeScanResult = ScannedSourceFile[] | {
  rows: ScannedSourceFile[];
  metrics?: Omit<SourceScanCompletedEvent, "backend"|"phase">;
};

function emitScanCompleted(
  options: SourceScanOptions,
  backend: SourceScanBackend,
  metrics: Omit<SourceScanCompletedEvent, "backend"|"phase">,
): void {
  options.scanObserver?.({
      phase: "completed",
      backend,
      ...metrics,
  });
}

function emitScanStarted(
  options: SourceScanOptions,
  backend: SourceScanBackend,
  metrics: Omit<SourceScanStartedEvent, "backend"|"phase">,
): void {
  options.scanObserver?.({
      phase: "scan-started",
      backend,
      ...metrics,
  });
}

function emitScanStage(
  options: SourceScanOptions,
  backend: SourceScanBackend,
  metrics: Omit<SourceScanStageEvent, "backend"|"phase">,
): void {
  options.scanObserver?.({
      phase: "scan-stage",
      backend,
      ...metrics,
  });
}

function parseNativeScanResult(result: NativeScanResult): {
  metrics?: Omit<SourceScanCompletedEvent, "backend"|"phase">;
  rows: ScannedSourceFile[];
} {
  if (Array.isArray(result)) {
    return { rows: result };
  }
  return {
    metrics: result.metrics,
    rows: result.rows,
  };
}

async function scanSourceFiles(options: SourceScanOptions): Promise<ScannedSourceFile[]> {
  emitScanStarted(options, "native", {
      projectRoot: options.projectRoot,
      sourceRoot: options.sourceRoot,
      sourceExtensionCount: options.sourceExtensions.length,
      excludePatternCount: options.excludeDirs.length,
      concurrency: 1,
  });
  const native = requireNativeBinding();
  const startedAt = performance.now();
  const rawResult = native.scanSourceFiles(JSON.stringify({
        projectRoot: options.projectRoot,
        sourceRoot: options.sourceRoot,
        sourceExtensions: options.sourceExtensions,
        excludeDirs: options.excludeDirs,
        ignorePatterns: options.ignore?.gitignorePatterns ?? [],
  }));
  emitScanStage(options, "native", {
      stage: "native-result",
      elapsedMs: performance.now() - startedAt,
  });
  const parsed = parseNativeScanResult(JSON.parse(rawResult) as NativeScanResult);
  emitScanStage(options, "native", {
      stage: "parse-result",
      fileCount: parsed.rows.length,
      elapsedMs: performance.now() - startedAt,
  });
  emitScanCompleted(options, "native", parsed.metrics ?? {
      chunkCount: 1,
      directoryCount: 0,
      fileCount: parsed.rows.length,
      elapsedMs: performance.now() - startedAt,
      concurrency: 1,
  });
  return parsed.rows;
}

export { scanSourceFiles };
