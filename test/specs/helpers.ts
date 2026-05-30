import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { SyncImportsLogEvent } from "../../src/index.js";

type TrebiredLogRow = {
  method: string;
  group: string;
  message: string;
  metadata?: Record<string, unknown>;
};

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "code-discipline-"));
}

function writeFile(projectRoot: string, relativePath: string, contents: string) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function readFile(projectRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readJson(projectRoot: string, relativePath: string): any {
  return JSON.parse(readFile(projectRoot, relativePath));
}

function fileExists(projectRoot: string, relativePath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function captureTrebiredLogger() {
  const rows: TrebiredLogRow[] = [];

  const logger = {
    debug(group: string, message: string, metadata?: Record<string, unknown>) {
      rows.push({ method: "debug", group, message, metadata });
    },
    info(group: string, message: string, metadata?: Record<string, unknown>) {
      rows.push({ method: "info", group, message, metadata });
    },
    warn(group: string, message: string, metadata?: Record<string, unknown>) {
      rows.push({ method: "warn", group, message, metadata });
    },
    fail(group: string, message: string, metadata?: Record<string, unknown>) {
      rows.push({ method: "fail", group, message, metadata });
    },
    success(group: string, message: string, metadata?: Record<string, unknown>) {
      rows.push({ method: "success", group, message, metadata });
    },
  };

  return { logger, rows };
}

function captureCallbackLogger() {
  const rows: SyncImportsLogEvent[] = [];

  return {
    rows,
    adapter(event: SyncImportsLogEvent) {
      rows.push(event);
    },
  };
}

export { captureCallbackLogger, captureTrebiredLogger, fileExists, readFile, readJson, tempProject, writeFile };
