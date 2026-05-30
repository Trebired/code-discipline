#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { checkCodeDiscipline } from "../checks/index.js";
import type { CodeDisciplineConfig } from "../checks/types.js";
import { loadCodeDisciplineConfig } from "../config/index.js";
import { syncImports } from "../imports/sync-imports.js";
import type { SyncImportsOptions } from "../imports/types.js";

type CliRunOptions = {
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

type CliRunResult = {
  exitCode: number;
};

function renderHelp(): string {
  return [
    "Usage: code-discipline <command> [--config <path>]",
    "",
    "Commands:",
    "  check         run configured discipline checks",
    "  sync          sync tsconfig aliases and rewrite imports",
    "",
  ].join("\n");
}

function parseArgs(args: string[]): { configPath?: string; extra: string[] } {
  let configPath: string | undefined;
  const extra: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --config");
      }

      configPath = value;
      index += 1;
      continue;
    }

    extra.push(arg);
  }

  return { configPath, extra };
}

function buildSyncImportsOptions(projectRoot: string, config: CodeDisciplineConfig): SyncImportsOptions {
  const { enabled: _enabled, ...syncRule } = config.rules?.syncImports ?? {};

  return {
    projectRoot,
    sourceRoot: syncRule.sourceRoot ?? config.sourceRoot,
    tsconfigPath: syncRule.tsconfigPath,
    sourceExtensions: syncRule.sourceExtensions ?? config.sourceExtensions,
    excludeDirs: syncRule.excludeDirs ?? config.excludeDirs,
    alias: syncRule.alias,
    imports: syncRule.imports,
    logging: syncRule.logging,
  };
}

function formatViolation(violation: Awaited<ReturnType<typeof checkCodeDiscipline>>["violations"][number]): string {
  const suggested = violation.suggestedPath ? ` suggested=${violation.suggestedPath}` : "";
  return `${violation.severity.toUpperCase()} ${violation.rule} ${violation.filePath} ${violation.message}${suggested}`;
}

async function runCli(argv: string[], options: CliRunOptions = {}): Promise<CliRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout(renderHelp());
    return { exitCode: 0 };
  }

  try {
    const parsed = parseArgs(rest);

    if (parsed.extra.length > 0) {
      throw new Error(`Unexpected arguments: ${parsed.extra.join(" ")}`);
    }

    const { config } = await loadCodeDisciplineConfig(cwd, parsed.configPath);

    if (command === "check") {
      const result = await checkCodeDiscipline({
        projectRoot: cwd,
        sourceRoot: config.sourceRoot,
        sourceExtensions: config.sourceExtensions,
        excludeDirs: config.excludeDirs,
        rules: config.rules,
      });

      if (result.violations.length === 0) {
        stdout("No discipline violations found.\n");
        return { exitCode: 0 };
      }

      for (const violation of result.violations) {
        stdout(`${formatViolation(violation)}\n`);
      }

      stdout(`Summary: ${result.errors} errors, ${result.warnings} warnings.\n`);
      return { exitCode: result.ok ? 0 : 1 };
    }

    if (command === "sync") {
      const result = await syncImports(buildSyncImportsOptions(cwd, config));
      stdout(`${JSON.stringify(result)}\n`);
      return { exitCode: 0 };
    }

    stderr(`Unknown command: ${command}\n`);
    stderr(renderHelp());
    return { exitCode: 1 };
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPath && import.meta.url === entryPath) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}

export { runCli };
export type { CliRunOptions, CliRunResult };
