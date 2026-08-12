import { performance } from "node:perf_hooks";
import path from "node:path";

import type {
  SourceProgressEvent,
  SourceRuleCompletedEvent,
  SourceRuleProgressEvent,
  SourceScanProgressEvent,
} from "#pkb9x3eo56l7";
import type { CliLogContext } from "./logging.js";

type TimedTaskResult<T> = {
  elapsedMs: number;
  result: T;
};
type ProgressWriter = (text: string, context?: CliLogContext) => void;

async function timeTask<T>(task: () => Promise<T>): Promise<TimedTaskResult<T>> {
  const startedAt = performance.now();
  const result = await task();
  return {
    elapsedMs: performance.now() - startedAt,
    result,
  };
}

function formatDuration(milliseconds: number): string {
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(milliseconds >= 10_000 ? 1 : 2)}s`;
  }

  if (milliseconds >= 100) {
    return `${Math.round(milliseconds)}ms`;
  }

  return `${milliseconds.toFixed(1)}ms`;
}

function shouldPrintScanChunk(event: SourceScanProgressEvent): boolean {
  return event.phase === "chunk"
  &&(event.chunkIndex <= 3 || event.chunkIndex % 10 === 0 || event.queuedDirectories === 0);
}

function formatRuleProgressDetails(event: SourceRuleProgressEvent | SourceRuleCompletedEvent): string {
  const details = [
    typeof event.violationCount === "number" ? `${event.violationCount} violations` : "",
    typeof event.deletedFiles === "number" ? `${event.deletedFiles} deleted` : "",
    typeof event.movedFiles === "number" ? `${event.movedFiles} moved` : "",
    typeof event.rewrittenFiles === "number" ? `${event.rewrittenFiles} rewritten files` : "",
    typeof event.rewrittenImports === "number" ? `${event.rewrittenImports} rewritten imports` : "",
    typeof event.removedComments === "number" ? `${event.removedComments} removed comments` : "",
    typeof event.discoveredFunctions === "number" ? `${event.discoveredFunctions} functions` : "",
    typeof event.duplicateGroups === "number" ? `${event.duplicateGroups} groups` : "",
    typeof event.comparedCandidates === "number" ? `${event.comparedCandidates} comparisons` : "",
  ].filter(Boolean);

  return details.length > 0 ? `, ${details.join(", ")}` : "";
}

function writeScanEvent(event: SourceScanProgressEvent, writeLine: ProgressWriter): void {
  if (event.phase === "scan-started") {
    const sourceRoot = path.relative(event.projectRoot, event.sourceRoot) || ".";
    writeLine(
      `Scan started: ${sourceRoot} (${event.backend}, ${event.sourceExtensionCount} extensions, ${event.excludePatternCount} ignore entries).\n`,
      { event: "source-scan-started", scanScope: event.backend },
    );
  } else if (event.phase === "scan-stage") {
    const fileCount = typeof event.fileCount === "number" ? `, ${event.fileCount} files` : "";
    writeLine(
      `Scan ${event.stage}: ${formatDuration(event.elapsedMs)}${fileCount} (${event.backend}).\n`,
      { event: "source-scan-stage", scanScope: event.backend },
    );
  } else if (event.phase === "chunk" && shouldPrintScanChunk(event)) {
    writeLine(
      `Scan ${event.chunkIndex}: ${event.discoveredFiles} files, ${formatDuration(event.elapsedMs)}.\n`,
      { event: "source-scan-chunk", scanScope: event.backend },
    );
  } else if (event.phase === "completed") {
    writeLine(
      `Scan: ${event.fileCount} files scanned in ${formatDuration(event.elapsedMs)} (${event.backend}).\n`,
      { event: "source-scan-completed", scanScope: event.backend },
    );
  }
}

function writeRuleEvent(
  event: Exclude<SourceProgressEvent, SourceScanProgressEvent>,
  writeLine: ProgressWriter,
): void {
  if (event.phase === "rule-started") {
    writeLine(
      `${event.rule} ${event.stage} started: ${event.totalItems} items.\n`,
      { event: "rule-progress-started", rule: event.rule },
    );
    return;
  }
  if (event.phase === "rule-chunk") {
    const message = `${event.rule} ${event.stage} ${event.chunkIndex}: `
    +`${event.completedItems}/${event.totalItems}${formatRuleProgressDetails(event)}, ${formatDuration(event.elapsedMs)}.\n`;
    writeLine(message, { event: "rule-progress-chunk", rule: event.rule });
    return;
  }
  writeLine(
    `${event.rule} ${event.stage}: ${event.totalItems} items${formatRuleProgressDetails(event)} in ${formatDuration(event.elapsedMs)}.\n`,
    { event: "rule-progress-completed", rule: event.rule },
  );
}

function createCliScanObserver(writeLine: ProgressWriter) {
  return (event: SourceProgressEvent) => {
    if (event.phase === "scan-started" || event.phase === "scan-stage" || event.phase === "chunk" || event.phase === "completed") {
      writeScanEvent(event, writeLine);
      return;
    }
    writeRuleEvent(event, writeLine);
  };
}

export { createCliScanObserver, formatDuration, timeTask };
export type { TimedTaskResult };
