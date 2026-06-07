#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { codeDiscipline } from "../run.js";
import type { CodeDisciplineRuleSlug, FixableRuleSlug } from "../checks/types.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";
import { loadResolvedCodeDisciplineConfig } from "../config/index.js";
import { isDirectExecution } from "../shared/utils.js";

type CliRunOptions = {
  cwd?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
};

type CliRunResult = {
  exitCode: number;
};

const SAVED_REPORT_FILENAME = "code-discipline-report.txt";

function renderHelp(): string {
  return [
    "Usage: code-discipline <command> [rule-slug...] [save] [--config <path>]",
    "",
    "Commands:",
    "  check         run read-only discipline validation",
    "  fix           apply configured discipline fixes",
    "  save          optional token that writes the run output to code-discipline-report.txt",
    "",
    "Rule Selectors:",
    "  check <rule-slug>... narrows validation to the selected configured rules",
    "  fix <rule-slug>... narrows fixes to the selected configured fixable rules",
    "",
    "Config:",
    "  --config <path> optionally points to a module that default-exports the config object.",
    "  If omitted, code-discipline will auto-discover a config module in the current project root.",
    "",
  ].join("\n");
}

function parseArgs(args: string[]): { configPath?: string; saveOutput: boolean; selectors: string[] } {
  let configPath: string | undefined;
  let saveOutput = false;
  const selectors: string[] = [];

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

  return { configPath, saveOutput, selectors };
}

function formatViolation(violation: CodeDisciplineViolation): string {
  const suggested = violation.suggestedPath ? ` suggested=${violation.suggestedPath}` : "";
  return `${violation.rule} ${violation.filePath} ${violation.message}${suggested}`;
}

function renderCheckOutput(violations: CodeDisciplineViolation[], violationCount: number): string {
  if (violations.length === 0) {
    return "No discipline violations found.\n";
  }

  return [
    ...violations.map((violation) => `${formatViolation(violation)}\n`),
    `Found ${violationCount} discipline violation(s).\n`,
  ].join("");
}

function renderFixOutput(args: {
  movedFiles: number;
  rewrittenFiles: number;
  rewrittenImports: number;
  violationCount: number;
  violations: CodeDisciplineViolation[];
}): string {
  return [
    ...args.violations.map((violation) => `${formatViolation(violation)}\n`),
    `Fix summary: moved ${args.movedFiles}, rewritten files ${args.rewrittenFiles}, rewritten imports ${args.rewrittenImports}, remaining violations ${args.violationCount}.\n`,
  ].join("");
}

async function saveCliOutput(cwd: string, reportText: string): Promise<string> {
  const reportPath = path.join(cwd, SAVED_REPORT_FILENAME);
  await fs.writeFile(reportPath, reportText, "utf8");
  return reportPath;
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

    const { config, configPath } = await loadResolvedCodeDisciplineConfig(cwd, parsed.configPath);

    if (command === "check") {
      const result = await codeDiscipline({
        ...config,
        configPath,
        mode: "check",
        onlyRules: parsed.selectors as CodeDisciplineRuleSlug[],
        projectRoot: cwd,
      });

      const reportText = renderCheckOutput(result.violations, result.violationCount);
      stdout(reportText);

      if (parsed.saveOutput) {
        await saveCliOutput(cwd, reportText);
        stdout(`Saved report to ${SAVED_REPORT_FILENAME}.\n`);
      }

      return { exitCode: result.ok ? 0 : 1 };
    }

    if (command === "fix") {
      const result = await codeDiscipline({
        ...config,
        configPath,
        mode: "fix",
        onlyRules: parsed.selectors as FixableRuleSlug[],
        projectRoot: cwd,
      });

      const reportText = renderFixOutput({
        movedFiles: result.moved_files,
        rewrittenFiles: result.rewritten_files,
        rewrittenImports: result.rewritten_imports,
        violationCount: result.violationCount,
        violations: result.violations,
      });
      stdout(reportText);

      if (parsed.saveOutput) {
        await saveCliOutput(cwd, reportText);
        stdout(`Saved report to ${SAVED_REPORT_FILENAME}.\n`);
      }

      return { exitCode: result.ok ? 0 : 1 };
    }

    stderr(`Unknown command: ${command}\n`);
    stderr(renderHelp());
    return { exitCode: 1 };
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

if (await isDirectExecution(import.meta.url, process.argv[1])) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}

export { runCli };
export type { CliRunOptions, CliRunResult };
