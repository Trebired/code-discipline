#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { codeDiscipline } from "../run.js";
import type { CodeDisciplineRuleSlug, FixableRuleSlug } from "../checks/types.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";
import { loadResolvedCodeDisciplineConfig } from "../config/index.js";
import { runGatedCommand } from "../runtime/gate-command.js";
import { isDirectExecution } from "../shared/utils.js";
import { createDefaultCliLogger, writeLogText } from "./logging.js";
import { createCliScanObserver, formatDuration, withLoadingAnimation } from "./progress.js";

type CliRunOptions = {
  cwd?: string;
  now?: Date;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

type CliRunResult = {
  exitCode: number;
};

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function createSavedReportFilename(now: Date): string {
  const year = now.getFullYear();
  const month = padDatePart(now.getMonth() + 1);
  const day = padDatePart(now.getDate());
  const hours = padDatePart(now.getHours());
  const minutes = padDatePart(now.getMinutes());
  const seconds = padDatePart(now.getSeconds());
  return `cd-report-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.txt`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatDryConfidence(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "unknown";
}

function formatDrySignals(value: unknown): string {
  if (!Array.isArray(value)) return "unknown";

  const signals = value.filter((signal): signal is string => typeof signal === "string" && signal.trim().length > 0);
  return signals.length > 0 ? signals.join(", ") : "unknown";
}

function formatDryFunctionLine(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function formatDryFunctionName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "anonymous function";
}

function formatDryFunctionDetail(value: unknown): string {
  const detail = isRecord(value) ? value : {};
  const filePath = typeof detail.filePath === "string" && detail.filePath.trim() ? detail.filePath.trim() : "unknown file";
  const line = formatDryFunctionLine(detail.line);
  const location = line ? `${filePath}:${line}` : filePath;

  return `  - ${location} ${formatDryFunctionName(detail.name)}`;
}

function formatDryViolation(violation: CodeDisciplineViolation): string {
  const details = violation.details;
  const functions = Array.isArray(details.functions) ? details.functions : [];
  const severity = violation.severity === "warning" ? "warning " : "";
  const functionLabel = functions.length === 1 ? "function" : "functions";
  const header = `${severity}${violation.rule} ${violation.message}: ${functions.length} ${functionLabel}, confidence ${formatDryConfidence(details.confidence)}, signals: ${formatDrySignals(details.signals)}`;
  const functionLines = functions.map(formatDryFunctionDetail);

  return functionLines.length > 0 ? [header, ...functionLines].join("\n") : header;
}

function formatViolation(violation: CodeDisciplineViolation): string {
  if (violation.rule === "dry") return formatDryViolation(violation);

  const suggested = violation.suggestedPath ? ` suggested=${violation.suggestedPath}` : "";
  const severity = violation.severity === "warning" ? "warning " : "";
  return `${severity}${violation.rule} ${violation.filePath} ${violation.message}${suggested}`;
}

function countBlockingViolations(violations: CodeDisciplineViolation[]): number {
  return violations.filter((violation) => violation.severity !== "warning").length;
}

function renderCheckOutput(violations: CodeDisciplineViolation[], violationCount: number): string {
  if (violations.length === 0) {
    return "No discipline violations found.\n";
  }

  const blockingCount = countBlockingViolations(violations);
  const warningCount = violationCount - blockingCount;

  return [
    ...violations.map((violation) => `${formatViolation(violation)}\n`),
    blockingCount > 0
      ? warningCount > 0
        ? `Found ${blockingCount} discipline violation(s) and ${warningCount} warning(s).\n`
        : `Found ${blockingCount} discipline violation(s).\n`
      : `Found ${warningCount} discipline warning(s).\n`,
  ].join("");
}

function renderFixOutput(args: {
  deletedFiles: number;
  movedFiles: number;
  rewrittenFiles: number;
  rewrittenImports: number;
  removedComments: number;
  violationCount: number;
  violations: CodeDisciplineViolation[];
}): string {
  return [
    ...args.violations.map((violation) => `${formatViolation(violation)}\n`),
    `Fix summary: deleted files ${args.deletedFiles}, moved ${args.movedFiles}, rewritten files ${args.rewrittenFiles}, rewritten imports ${args.rewrittenImports}, removed comments ${args.removedComments}, remaining violations ${args.violationCount}.\n`,
  ].join("");
}

async function saveCliOutput(cwd: string, reportText: string, now: Date): Promise<string> {
  const reportFilename = createSavedReportFilename(now);
  const reportPath = path.join(cwd, reportFilename);
  await fs.writeFile(reportPath, reportText, "utf8");
  return reportFilename;
}

async function writeSavedReport(
  args: { cwd: string; now: Date; reportText: string; saveOutput: boolean; stdout: (text: string) => void },
): Promise<void> {
  if (!args.saveOutput) return;

  const reportFilename = await saveCliOutput(args.cwd, args.reportText, args.now);
  args.stdout(`Saved report to ${reportFilename}.\n`);
}

async function runCheckCommand(args: {
  config: Record<string, unknown>;
  configPath: string | undefined;
  cwd: string;
  now: Date;
  parsed: ReturnType<typeof parseArgs>;
  showLoadingAnimation: boolean;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
}): Promise<CliRunResult> {
  if (args.parsed.commandArgs.length > 0) {
    throw new Error("Command separator -- is only supported with gate");
  }

  const timed = await withLoadingAnimation("Scanning codebase", args.showLoadingAnimation, (writeLine) => {
    const progressObserver = createCliScanObserver(args.showLoadingAnimation ? writeLine : args.stderr);
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
  const reportText = renderCheckOutput(result.violations, result.violationCount);

  args.stderr(`Total check: ${formatDuration(timed.elapsedMs)}.\n`);
  args.stdout(reportText);
  await writeSavedReport({ ...args, reportText, saveOutput: args.parsed.saveOutput });
  return { exitCode: result.ok ? 0 : 1 };
}

async function runFixCommand(args: {
  config: Record<string, unknown>;
  configPath: string | undefined;
  cwd: string;
  now: Date;
  parsed: ReturnType<typeof parseArgs>;
  showLoadingAnimation: boolean;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
}): Promise<CliRunResult> {
  if (args.parsed.commandArgs.length > 0) {
    throw new Error("Command separator -- is only supported with gate");
  }

  const timed = await withLoadingAnimation("Fixing codebase", args.showLoadingAnimation, (writeLine) => {
    const progressObserver = createCliScanObserver(args.showLoadingAnimation ? writeLine : args.stderr);
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
  const reportText = renderFixOutput({
    deletedFiles: result.deleted_files,
    movedFiles: result.moved_files,
    rewrittenFiles: result.rewritten_files,
    rewrittenImports: result.rewritten_imports,
    removedComments: result.removed_comments ?? 0,
    violationCount: result.violationCount,
    violations: result.violations,
  });

  args.stdout(reportText);
  await writeSavedReport({ ...args, reportText, saveOutput: args.parsed.saveOutput });
  return { exitCode: result.ok ? 0 : 1 };
}

async function runGateCommand(args: {
  config: Record<string, unknown>;
  configPath: string | undefined;
  cwd: string;
  now: Date;
  parsed: ReturnType<typeof parseArgs>;
  showLoadingAnimation: boolean;
  stderr: (text: string) => void;
  stdout: (text: string) => void;
}): Promise<CliRunResult> {
  if (args.parsed.commandArgs.length === 0) {
    throw new Error("Missing child command after --");
  }

  const timed = await withLoadingAnimation("Scanning codebase", args.showLoadingAnimation, (writeLine) => {
    const progressObserver = createCliScanObserver(args.showLoadingAnimation ? writeLine : args.stderr);
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
    const reportText = renderCheckOutput(result.violations, result.violationCount);
    args.stdout(reportText);
    await writeSavedReport({ ...args, reportText, saveOutput: args.parsed.saveOutput });
    return { exitCode: 1 };
  }

  const [childCommand, ...childArgs] = args.parsed.commandArgs;
  return runGatedCommand({ args: childArgs, command: childCommand, cwd: args.cwd });
}

async function runCli(argv: string[], options: CliRunOptions = {}): Promise<CliRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date();
  const useDefaultLogger = !options.stdout && !options.stderr;
  const logger = useDefaultLogger ? createDefaultCliLogger() : null;
  const stdout = options.stdout ?? (useDefaultLogger
    ? ((text: string) => writeLogText(logger!, "info", text))
    : ((text: string) => process.stdout.write(text)));
  const stderr = options.stderr ?? (useDefaultLogger
    ? ((text: string) => writeLogText(logger!, "info", text))
    : ((text: string) => process.stderr.write(text)));
  const fail = options.stderr ?? (useDefaultLogger
    ? ((text: string) => writeLogText(logger!, "fail", text))
    : ((text: string) => process.stderr.write(text)));
  const showLoadingAnimation = !options.stderr && Boolean(process.stderr.isTTY) && !process.env.CI;
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
      showLoadingAnimation,
      stderr,
      stdout,
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
