#!/usr/bin/env node

import { codeDiscipline } from "../run.js";
import type { CodeDisciplineRuleSlug, FixableRuleSlug } from "../checks/types.js";
import { loadResolvedCodeDisciplineConfig } from "../config/index.js";
import { runGatedCommand } from "../runtime/gate-command.js";
import { isDirectExecution } from "../shared/utils.js";
import { createDefaultCliLogger, writeLogText } from "./logging.js";
import { writeCheckOutput, writeFixOutput, writeSavedReport } from "./output.js";
import { createCliScanObserver, formatDuration, timeTask } from "./progress.js";

type CliRunOptions = {
  cwd?: string;
  now?: Date;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

type CliRunResult = {
  exitCode: number;
};

type CliWriters = {
  fail: (text: string) => void;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
  warn: (text: string) => void;
};

function createCliWriters(options: CliRunOptions): CliWriters {
  const useDefaultLogger = !options.stdout && !options.stderr;
  const logger = useDefaultLogger ? createDefaultCliLogger() : null;
  const stdout = options.stdout ?? (useDefaultLogger
    ? ((text: string) => writeLogText(logger!, "info", text))
    : ((text: string) => process.stdout.write(text)));
  const stderr = options.stderr ?? (useDefaultLogger
    ? ((text: string) => writeLogText(logger!, "info", text))
    : ((text: string) => process.stderr.write(text)));

  return {
    fail: options.stderr ?? (useDefaultLogger
      ? ((text: string) => writeLogText(logger!, "fail", text))
      : ((text: string) => process.stderr.write(text))),
    stderr,
    stdout,
    warn: options.stdout ?? (useDefaultLogger
      ? ((text: string) => writeLogText(logger!, "warn", text))
      : ((text: string) => process.stdout.write(text))),
  };
}

function renderHelp(): string {
  return [
    "Usage: code-discipline <command> [rule-slug...] [save] [--config <path>]",
    "       code-discipline gate [rule-slug...] [save] [--config <path>] -- <command> [args...]",
    "",
    "Commands:",
    "  check         run read-only discipline validation",
    "  fix           apply configured discipline fixes",
    "  gate          block a child command when discipline violations exist",
    "  save          optional token that writes the run output to a timestamped cd-report-YYYY-MM-DD-HH-mm-ss.txt file",
    "",
    "Rule Selectors:",
    "  check <rule-slug>... narrows validation to the selected configured rules",
    "  fix <rule-slug>... narrows fixes to the selected configured fixable rules",
    "  gate <rule-slug>... narrows the pre-start validation before the child command runs",
    "",
    "Config:",
    "  --config <path> optionally points to a module that default-exports the config object.",
    "  If omitted, code-discipline will auto-discover a config module in the current project root.",
    "",
    "Gate:",
    "  gate requires -- before the child command so code-discipline can separate its own arguments.",
    "",
  ].join("\n");
}

function parseArgs(args: string[]): {
  configPath?: string;
  saveOutput: boolean;
  selectors: string[];
  commandArgs: string[];
} {
  let configPath: string | undefined;
  let saveOutput = false;
  const selectors: string[] = [];
  let commandArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      commandArgs = args.slice(index + 1);
      break;
    }

    if (arg === "--config") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --config");
      }

      configPath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      if (arg === "--save") {
        saveOutput = true;
        continue;
      }

      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (arg === "save") {
      saveOutput = true;
      continue;
    }

    selectors.push(arg);
  }

  return { configPath, saveOutput, selectors, commandArgs };
}

async function runCheckCommand(args: {
  config: Record<string, unknown>;
  configPath: string | undefined;
  cwd: string;
  now: Date;
  parsed: ReturnType<typeof parseArgs>;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
  warn: (text: string) => void;
}): Promise<CliRunResult> {
  if (args.parsed.commandArgs.length > 0) {
    throw new Error("Command separator -- is only supported with gate");
  }

  const timed = await timeTask(() => {
    const progressObserver = createCliScanObserver(args.stderr);
    return codeDiscipline({
      ...args.config,
      configPath: args.configPath,
      mode: "check",
      onlyRules: args.parsed.selectors as CodeDisciplineRuleSlug[],
      projectRoot: args.cwd,
      progressObserver,
      scanObserver: progressObserver,
    });
  });
  const result = timed.result;
  args.stderr(`Total check: ${formatDuration(timed.elapsedMs)}.\n`);
  const reportText = writeCheckOutput({
    stdout: args.stdout,
    violationCount: result.violationCount,
    violations: result.violations,
    warn: args.warn,
  });

  await writeSavedReport({ ...args, reportText, saveOutput: args.parsed.saveOutput });
  return { exitCode: result.ok ? 0 : 1 };
}

async function runFixCommand(args: {
  config: Record<string, unknown>;
  configPath: string | undefined;
  cwd: string;
  now: Date;
  parsed: ReturnType<typeof parseArgs>;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
  warn: (text: string) => void;
}): Promise<CliRunResult> {
  if (args.parsed.commandArgs.length > 0) {
    throw new Error("Command separator -- is only supported with gate");
  }

  const timed = await timeTask(() => {
    const progressObserver = createCliScanObserver(args.stderr);
    return codeDiscipline({
      ...args.config,
      configPath: args.configPath,
      mode: "fix",
      onlyRules: args.parsed.selectors as FixableRuleSlug[],
      projectRoot: args.cwd,
      progressObserver,
      scanObserver: progressObserver,
    });
  });
  const result = timed.result;
  const reportText = writeFixOutput({
    deletedFiles: result.deleted_files,
    movedFiles: result.moved_files,
    rewrittenFiles: result.rewritten_files,
    rewrittenImports: result.rewritten_imports,
    removedComments: result.removed_comments ?? 0,
    stdout: args.stdout,
    violationCount: result.violationCount,
    violations: result.violations,
    warn: args.warn,
  });

  await writeSavedReport({ ...args, reportText, saveOutput: args.parsed.saveOutput });
  return { exitCode: result.ok ? 0 : 1 };
}

async function runGateCommand(args: {
  config: Record<string, unknown>;
  configPath: string | undefined;
  cwd: string;
  now: Date;
  parsed: ReturnType<typeof parseArgs>;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
  warn: (text: string) => void;
}): Promise<CliRunResult> {
  if (args.parsed.commandArgs.length === 0) {
    throw new Error("Missing child command after --");
  }

  const timed = await timeTask(() => {
    const progressObserver = createCliScanObserver(args.stderr);
    return codeDiscipline({
      ...args.config,
      configPath: args.configPath,
      mode: "check",
      onlyRules: args.parsed.selectors as CodeDisciplineRuleSlug[],
      projectRoot: args.cwd,
      progressObserver,
      scanObserver: progressObserver,
    });
  });
  const result = timed.result;
  args.stderr(`Total gate check: ${formatDuration(timed.elapsedMs)}.\n`);

  if (!result.ok) {
    const reportText = writeCheckOutput({
      stdout: args.stdout,
      violationCount: result.violationCount,
      violations: result.violations,
      warn: args.warn,
    });
    await writeSavedReport({ ...args, reportText, saveOutput: args.parsed.saveOutput });
    return { exitCode: 1 };
  }

  const [childCommand, ...childArgs] = args.parsed.commandArgs;
  return runGatedCommand({ args: childArgs, command: childCommand, cwd: args.cwd });
}

async function runCli(argv: string[], options: CliRunOptions = {}): Promise<CliRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date();
  const { fail, stderr, stdout, warn } = createCliWriters(options);
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    stdout(renderHelp());
    return { exitCode: 0 };
  }

  try {
    const parsed = parseArgs(rest);

    const { config, configPath } = await loadResolvedCodeDisciplineConfig(cwd, parsed.configPath);
    const commandArgs = {
      config,
      configPath,
      cwd,
      now,
      parsed,
      stderr,
      stdout,
      warn,
    };

    if (command === "check") {
      return await runCheckCommand(commandArgs);
    }

    if (command === "fix") {
      return await runFixCommand(commandArgs);
    }

    if (command === "gate") {
      return await runGateCommand(commandArgs);
    }

    fail(`Unknown command: ${command}\n`);
    stderr(renderHelp());
    return { exitCode: 1 };
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

if (await isDirectExecution(import.meta.url, process.argv[1])) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}

export { runCli };
export type { CliRunOptions, CliRunResult };
