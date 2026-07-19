import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

function runCommand(command: string, args: string[], options: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}) {
  if (typeof Bun !== "undefined") {
    const result = Bun.spawnSync([command, ...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    return {
      error: undefined,
      signal: null,
      status: result.exitCode,
      stderr: new TextDecoder().decode(result.stderr),
      stdout: new TextDecoder().decode(result.stdout),
    };
  }

  return spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    encoding: "utf8",
  });
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const builtCliPath = path.join(packageRoot, "dist", "cli.js");
let builtCliReady = false;

function ensureBuiltCli() {
  if (builtCliReady && fs.existsSync(builtCliPath)) {
    return;
  }

  const result = runCommand("bun", ["run", "build"], {
    cwd: packageRoot,
  });

  if (result.status !== 0) {
    throw new Error(`build failed: ${result.stderr || result.stdout}`);
  }

  builtCliReady = true;
}

function writeErroringCliFixture(projectRoot: string) {
  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
  writeFile(projectRoot, "tb.code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    maxFileLines: {",
    "      max: 2,",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));
}

export {
  builtCliPath,
  captureCallbackLogger,
  captureTrebiredLogger,
  ensureBuiltCli,
  fileExists,
  packageRoot,
  readFile,
  readJson,
  runCommand,
  tempProject,
  writeErroringCliFixture,
  writeFile,
};
