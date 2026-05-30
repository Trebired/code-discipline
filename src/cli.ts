#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { runCli } from "./cli/run-cli.js";

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPath && import.meta.url === entryPath) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}

export { runCli };
export type { CliRunOptions, CliRunResult } from "./cli/run-cli.js";
