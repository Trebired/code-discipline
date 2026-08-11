import path from "node:path";
import { performance } from "node:perf_hooks";
import type {
  ExcludeDirEntry,
  ScannedSourceFile,
  SourceScanBackend,
  SourceScanCompletedEvent,
  SourceScanOptions,
} from "./types.js";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { matchesGlob } from "#49ihfa399fpp";
import { CODE_DISCIPLINE_STATE_DIR } from "#ik5y0pee4ah1";
import { isCodeDisciplineStatePath, normalizeRelativePath, toPosixPath, uniqueStrings } from "#ntve5i5a0mol";
type NativeScanResult = ScannedSourceFile[] | {
  rows: ScannedSourceFile[];
  metrics?: Omit<SourceScanCompletedEvent, "backend" | "phase">;
};
type ExcludeMatcher = {
  shouldExcludeDirectory: (relativeDir: string, projectRelativeDir: string, directoryName: string) => boolean;
};
type NormalizedExcludeEntry = {
  exact: string;
  prefix: string;
};
function createExcludeMatcher(excludeDirs: ExcludeDirEntry[], type: ExcludeDirEntry["type"]): ExcludeMatcher {
  const packageOwnedEntries = type === "folder" ? [CODE_DISCIPLINE_STATE_DIR] : [];
  const normalizedEntries = uniqueStrings([
    ...packageOwnedEntries,
    ...excludeDirs
    .filter((entry) => entry.type === type)
    .map((entry) => normalizeRelativePath(entry.pattern).replace(/\/+$/g, ""))
    .filter(Boolean),
  ]);
  const excludedDirectoryNames = new Set(normalizedEntries.filter((entry) => !entry.includes("/")));
  const excludedPaths = normalizedEntries
    .filter((entry) => entry.includes("/"))
    .map((entry) => ({ exact: entry, prefix: `${entry}/` }));
  return {
    shouldExcludeDirectory(relativeDir: string, projectRelativeDir: string, directoryName: string): boolean {
      const normalizedRelativeDir = normalizeRelativePath(relativeDir);
      const normalizedProjectRelativeDir = normalizeRelativePath(projectRelativeDir);
      if (excludedDirectoryNames.has(directoryName)) {
        return true;
      }
      for (const entry of normalizedEntries) {
        if (matchesGlob(directoryName, entry) || matchesGlob(normalizedRelativeDir, entry) || matchesGlob(normalizedProjectRelativeDir, entry)) {
          return true;
        }
      }
      for (const entry of excludedPaths) {
        if (
          normalizedRelativeDir === entry.exact
          || normalizedRelativeDir.startsWith(entry.prefix)
          || normalizedProjectRelativeDir === entry.exact
          || normalizedProjectRelativeDir.startsWith(entry.prefix)
        ) {
          return true;
        }
      }
      return false;
    },
  };
}
function shouldExcludeFile(file: ScannedSourceFile, options: SourceScanOptions): boolean {
  const relativeFromProjectRoot = normalizeRelativePath(file.relativeFromProjectRoot);
  if (isCodeDisciplineStatePath(relativeFromProjectRoot)) return true;
  return options.excludeDirs
    .filter((entry) => entry.type === "file")
    .some((entry) => matchesGlob(relativeFromProjectRoot, entry.pattern));
}
function filterExcludedFiles(files: ScannedSourceFile[], options: SourceScanOptions): ScannedSourceFile[] {
  if (!options.excludeDirs.some((entry) => entry.type === "file")) return files;
  return files.filter((file) => !shouldExcludeFile(file, options));
}
function emitScanCompleted(
  options: SourceScanOptions,
  backend: SourceScanBackend,
  metrics: Omit<SourceScanCompletedEvent, "backend" | "phase">,
): void {
  options.scanObserver?.({
    phase: "completed",
    backend,
    ...metrics,
  });
}
function parseNativeScanResult(result: NativeScanResult): {
  metrics?: Omit<SourceScanCompletedEvent, "backend" | "phase">;
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
  const native = requireNativeBinding();
  const startedAt = performance.now();
  const parsed = parseNativeScanResult(JSON.parse(native.scanSourceFiles(JSON.stringify({
    projectRoot: options.projectRoot,
    sourceRoot: options.sourceRoot,
    sourceExtensions: options.sourceExtensions,
    excludeDirs: options.excludeDirs.filter((entry) => entry.type === "folder").map((entry) => entry.pattern),
  }))) as NativeScanResult);
  const rows = filterExcludedFiles(parsed.rows.filter((file) => !createExcludeMatcher(options.excludeDirs, "folder").shouldExcludeDirectory(
    path.dirname(file.relativeFromSourceRoot),
    path.dirname(file.relativeFromProjectRoot),
    path.basename(path.dirname(file.relativeFromProjectRoot)),
  )), options);
  emitScanCompleted(options, "native", parsed.metrics ?? {
    chunkCount: 1,
    directoryCount: 0,
    fileCount: rows.length,
    elapsedMs: performance.now() - startedAt,
    concurrency: 1,
  });
  return rows;
}
export { scanSourceFiles };
