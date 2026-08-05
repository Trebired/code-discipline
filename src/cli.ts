#!/usr/bin/env node

import { runCli } from "./cli/run.js";
import { isDirectExecution } from "./shared/utils.js";

if (await isDirectExecution(import.meta.url, process.argv[1])) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}

export { runCli };
export type { CliRunOptions, CliRunResult } from "./cli/run.js";
