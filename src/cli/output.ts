import fs from "node:fs/promises";
import path from "node:path";

import type { CliLogContext } from "./logging.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";

type CliOutputWriter = (text: string, context?: CliLogContext) => void;

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
  const functionLabel = functions.length === 1 ? "function" : "functions";
  const header = `${violation.rule} ${violation.message}: ${functions.length} ${functionLabel}, confidence ${formatDryConfidence(details.confidence)}, signals: ${formatDrySignals(details.signals)}`;
  const functionLines = functions.map(formatDryFunctionDetail);

  return functionLines.length > 0 ? [header, ...functionLines].join("\n") : header;
}

function formatViolation(violation: CodeDisciplineViolation): string {
  if (violation.rule === "dry") return formatDryViolation(violation);

  const suggested = violation.suggestedPath ? ` suggested=${violation.suggestedPath}` : "";
  return `${violation.rule} ${violation.filePath} ${violation.message}${suggested}`;
}

function countBlockingViolations(violations: CodeDisciplineViolation[]): number {
  return violations.filter((violation) => violation.severity !== "warning").length;
}

function renderCheckSummary(blockingCount: number, warningCount: number): string {
  if (blockingCount > 0) {
    return warningCount > 0
      ? `Found ${blockingCount} discipline violation(s) and ${warningCount} warning(s).\n`
      : `Found ${blockingCount} discipline violation(s).\n`;
  }

  return `Found ${warningCount} discipline warning(s).\n`;
}

function renderCheckOutput(violations: CodeDisciplineViolation[], violationCount: number): string {
  if (violations.length === 0) {
    return "No discipline violations found.\n";
  }

  const blockingCount = countBlockingViolations(violations);
  const warningCount = violationCount - blockingCount;

  return [
    ...violations.map((violation) => `${formatViolation(violation)}\n`),
    renderCheckSummary(blockingCount, warningCount),
  ].join("");
}

function writeCheckOutput(args: {
  fail: CliOutputWriter;
  stdout: CliOutputWriter;
  success: CliOutputWriter;
  warn: CliOutputWriter;
  violationCount: number;
  violations: CodeDisciplineViolation[];
}): string {
  const reportText = renderCheckOutput(args.violations, args.violationCount);

  if (args.violations.length === 0) {
    args.success(reportText, { event: "discipline-check-ok" });
    return reportText;
  }

  for (const violation of args.violations) {
    const writeLine = violation.severity === "warning" ? args.warn : args.fail;
    writeLine(`${formatViolation(violation)}\n`, { event: "discipline-violation", rule: violation.rule });
  }

  const blockingCount = countBlockingViolations(args.violations);
  const warningCount = args.violationCount - blockingCount;
  const summary = renderCheckSummary(blockingCount, warningCount);
  (blockingCount > 0 ? args.fail : args.warn)(summary, { event: "discipline-check-summary" });
  return reportText;
}

function renderFixOutput(args: {
  deletedFiles: number;
  movedFiles: number;
  rewrittenFiles: number;
  rewrittenImports: number;
  removedComments: number;
  formattedFiles?: number;
  unchangedFiles?: number;
  violationCount: number;
  violations: CodeDisciplineViolation[];
}): string {
  const formatterSummary = args.formattedFiles === undefined && args.unchangedFiles === undefined
    ? ""
    : ` formatted files ${args.formattedFiles ?? 0}, unchanged files ${args.unchangedFiles ?? 0}.`;

  return [
    ...args.violations.map((violation) => `${formatViolation(violation)}\n`),
    `Fix summary: deleted files ${args.deletedFiles}, moved ${args.movedFiles}, rewritten files ${args.rewrittenFiles}, rewritten imports ${args.rewrittenImports}, removed comments ${args.removedComments}, remaining violations ${args.violationCount}.${formatterSummary}\n`,
  ].join("");
}

function writeFixOutput(args: {
  deletedFiles: number;
  movedFiles: number;
  rewrittenFiles: number;
  rewrittenImports: number;
  removedComments: number;
  formattedFiles?: number;
  unchangedFiles?: number;
  fail: CliOutputWriter;
  success: CliOutputWriter;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  warn: CliOutputWriter;
}): string {
  const reportText = renderFixOutput(args);

  for (const violation of args.violations) {
    const writeLine = violation.severity === "warning" ? args.warn : args.fail;
    writeLine(`${formatViolation(violation)}\n`, { event: "discipline-fix-violation", rule: violation.rule });
  }

  const formatterSummary = args.formattedFiles === undefined && args.unchangedFiles === undefined
    ? ""
    : ` formatted files ${args.formattedFiles ?? 0}, unchanged files ${args.unchangedFiles ?? 0}.`;
  const summary = `Fix summary: deleted files ${args.deletedFiles}, moved ${args.movedFiles}, rewritten files ${args.rewrittenFiles}, rewritten imports ${args.rewrittenImports}, removed comments ${args.removedComments}, remaining violations ${args.violationCount}.${formatterSummary}\n`;
  (args.violationCount > 0 ? args.fail : args.success)(summary, { event: "discipline-fix-summary" });
  return reportText;
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

export { writeCheckOutput, writeFixOutput, writeSavedReport };
