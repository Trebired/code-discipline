import { createLog, type LogInstance } from "@trebired/logger";

import { CODE_DISCIPLINE_LOG_GROUP } from "../shared/constants.js";
import type { CodeDisciplineCheckName } from "../shared/discipline-types.js";
import { buildCodeDisciplineLogGroup, ruleLogGroup, runLogGroup, sourceScanLogGroup } from "../shared/log-groups.js";

type CliLogLevel = "fail" | "info" | "success" | "warn";

type CliLogContext = {
  group?: string;
  event?: string;
  rule?: CodeDisciplineCheckName | string;
  scanScope?: string;
};

const RULE_SLUGS = new Set([
  "banned-patterns",
  "banned-files",
  "min-file-lines",
  "min-declaration-name",
  "max-file-lines",
  "max-characters-per-line",
  "max-function-lines",
  "folderize-compound-files",
  "sync-imports",
  "remove-comments",
  "dry",
  "prettier",
]);

function createDefaultCliLogger(): LogInstance {
  return createLog({
    console: {
      metadata: false,
      timestamp: false,
    },
    quiet: true,
    save: false,
    source: "@trebired/code-discipline",
  });
}

function ruleFromLine(line: string): string | null {
  const [firstToken] = line.trimStart().split(/\s+/, 1);
  return firstToken && RULE_SLUGS.has(firstToken) ? firstToken : null;
}

function inferLogGroup(line: string, context: CliLogContext | undefined): string {
  if (context?.group) return context.group;
  if (context?.rule) return ruleLogGroup(context.rule);
  if (context?.scanScope) return sourceScanLogGroup(context.scanScope);

  const rule = ruleFromLine(line);
  if (rule) return ruleLogGroup(rule);

  if (line.startsWith("Scan")) return sourceScanLogGroup("source");
  if (line.startsWith("Total gate check:")) return runLogGroup("gate");
  if (line.startsWith("Total check:")) return runLogGroup("check");
  if (line.startsWith("Fix summary:")) return runLogGroup("fix");
  if (line.startsWith("Found ")) return buildCodeDisciplineLogGroup("results");
  if (line.startsWith("No discipline violations found.")) return buildCodeDisciplineLogGroup("results");

  return `${CODE_DISCIPLINE_LOG_GROUP}.cli`;
}

function writeLogText(logger: LogInstance, level: CliLogLevel, text: string, context?: CliLogContext): void {
  const method = level === "fail"
    ? logger.fail
    : level === "warn"
      ? logger.warn
      : level === "success"
        ? logger.success
        : logger.info;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    method.call(logger, inferLogGroup(line, context), line, context?.event ? { event: context.event } : undefined);
  }
}

export { createDefaultCliLogger, writeLogText };
export type { CliLogContext, CliLogLevel };
