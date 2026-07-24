import { performance } from "node:perf_hooks";

import type {
  SourceProgressEvent,
  SourceRuleCompletedEvent,
  SourceRuleProgressEvent,
  SourceScanProgressEvent,
} from "../imports/types.js";
import type { CliLogContext } from "./logging.js";

type TimedTaskResult<T> = {
  elapsedMs: number;
  result: T;
};

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
    && (event.chunkIndex <= 3 || event.chunkIndex % 10 === 0 || event.queuedDirectories === 0);
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

function createCliScanObserver(writeLine: (text: string, context?: CliLogContext) => void) {
  return (event: SourceProgressEvent) => {
    if (event.phase === "chunk") {
      if (!shouldPrintScanChunk(event)) return;

      writeLine(
        `Scan ${event.chunkIndex}: ${event.discoveredFiles} files, ${formatDuration(event.elapsedMs)}.\n`,
        { event: "source-scan-chunk", scanScope: event.backend },
      );
      return;
    }

    if (event.phase === "completed") {
      writeLine(
        `Scan: ${event.fileCount} files scanned in ${formatDuration(event.elapsedMs)} (${event.backend}).\n`,
        { event: "source-scan-completed", scanScope: event.backend },
      );
      return;
    }

    if (event.phase === "rule-chunk") {
      writeLine(
        `${event.rule} ${event.stage} ${event.chunkIndex}: ${event.completedItems}/${event.totalItems}${formatRuleProgressDetails(event)}, ${formatDuration(event.elapsedMs)}.\n`,
        { event: "rule-progress-chunk", rule: event.rule },
      );
      return;
    }

    writeLine(
      `${event.rule} ${event.stage}: ${event.totalItems} items${formatRuleProgressDetails(event)} in ${formatDuration(event.elapsedMs)}.\n`,
      { event: "rule-progress-completed", rule: event.rule },
    );
  };
}

export { createCliScanObserver, formatDuration, timeTask };
export type { TimedTaskResult };
