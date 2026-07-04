import { performance } from "node:perf_hooks";

import type { SourceScanProgressEvent } from "../imports/types.js";

type LoadingAnimation = {
  pause: () => void;
  resume: () => void;
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
      pause() {},
      resume() {},
      stop() {},
    };
  }

  let frameIndex = 0;
  let running = true;

  const render = () => {
    if (!running) return;
    process.stderr.write(`\r${label} ${LOADING_FRAMES[frameIndex]}`);
  };

  const clear = () => {
    process.stderr.write(`\r${" ".repeat(label.length + 2)}\r`);
  };

  render();
  const timer = setInterval(() => {
    frameIndex = (frameIndex + 1) % LOADING_FRAMES.length;
    render();
  }, 120);

  return {
    pause() {
      clear();
    },
    resume() {
      render();
    },
    stop() {
      running = false;
      clearInterval(timer);
      clear();
    },
  };
}

async function withLoadingAnimation<T>(
  label: string,
  enabled: boolean,
  task: (writeLine: (text: string) => void) => Promise<T>,
): Promise<TimedTaskResult<T>> {
  const startedAt = performance.now();
  const animation = createLoadingAnimation(label, enabled);
  const writeLine = (text: string) => {
    animation.pause();
    process.stderr.write(text);
    animation.resume();
  };

  try {
    const result = await task(writeLine);
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

function createCliScanObserver(writeLine: (text: string) => void) {
  return (event: SourceScanProgressEvent) => {
    if (event.phase === "chunk") {
      if (!shouldPrintScanChunk(event)) return;

      writeLine(
        `Scan ${event.chunkIndex}: ${event.discoveredFiles} files, ${event.completedDirectories} dirs, `
        + `${formatDuration(event.elapsedMs)}.\n`,
      );
      return;
    }

    writeLine(
      `Discovered ${event.fileCount} files in ${formatDuration(event.elapsedMs)} `
      + `(${event.backend} scan, ${event.directoryCount} dirs).\n`,
    );
  };
}

export { createCliScanObserver, formatDuration, withLoadingAnimation };
export type { TimedTaskResult };
