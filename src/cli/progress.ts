import { performance } from "node:perf_hooks";

import type { SourceScanProgressEvent } from "../imports/types.js";

type LoadingAnimation = {
  stop: () => void;
};

type TimedTaskResult<T> = {
  elapsedMs: number;
  result: T;
};

const LOADING_FRAMES = ["-", "\\", "|", "/"];

function createLoadingAnimation(label: string, enabled: boolean): LoadingAnimation {
  if (!enabled) {
    return {
      stop() {},
    };
  }

  let frameIndex = 0;
  process.stderr.write(`${label} ${LOADING_FRAMES[frameIndex]}`);
  const timer = setInterval(() => {
    frameIndex = (frameIndex + 1) % LOADING_FRAMES.length;
    process.stderr.write(`\r${label} ${LOADING_FRAMES[frameIndex]}`);
  }, 120);

  return {
    stop() {
      clearInterval(timer);
      process.stderr.write(`\r${" ".repeat(label.length + 2)}\r`);
    },
  };
}

async function withLoadingAnimation<T>(label: string, enabled: boolean, task: () => Promise<T>): Promise<TimedTaskResult<T>> {
  const startedAt = performance.now();
  const animation = createLoadingAnimation(label, enabled);

  try {
    const result = await task();
    return {
      elapsedMs: performance.now() - startedAt,
      result,
    };
  } finally {
    animation.stop();
  }
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

function createCliScanObserver(stderr: (text: string) => void) {
  return (event: SourceScanProgressEvent) => {
    if (event.phase === "chunk") {
      if (!shouldPrintScanChunk(event)) return;

      stderr(
        `Source scan chunk ${event.chunkIndex}: dirs ${event.completedDirectories}, queued ${event.queuedDirectories}, `
        + `chunk files ${event.chunkMatchedFiles}, total files ${event.discoveredFiles}, `
        + `concurrency ${event.concurrency}, elapsed ${formatDuration(event.elapsedMs)}.\n`,
      );
      return;
    }

    stderr(
      `Source scan finished via ${event.backend} backend in ${formatDuration(event.elapsedMs)} `
      + `for ${event.fileCount} file(s) across ${event.directoryCount} director${event.directoryCount === 1 ? "y" : "ies"} `
      + `using ${event.chunkCount} chunk(s) at concurrency ${event.concurrency}.\n`,
    );
  };
}

export { createCliScanObserver, formatDuration, withLoadingAnimation };
export type { TimedTaskResult };
