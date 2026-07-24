import { CODE_DISCIPLINE_LOG_GROUP } from "./constants.js";
import type { CodeDisciplineRuleName } from "./discipline-types.js";

function buildCodeDisciplineLogGroup(...parts: string[]): string {
  return [CODE_DISCIPLINE_LOG_GROUP, ...parts.filter((part) => part.trim().length > 0)].join(".");
}

function ruleLogGroup(rule: CodeDisciplineRuleName | string): string {
  return buildCodeDisciplineLogGroup("rules", rule);
}

function runLogGroup(command: string): string {
  return buildCodeDisciplineLogGroup("runs", command);
}

function sourceScanLogGroup(scope: string): string {
  return buildCodeDisciplineLogGroup("scan", scope);
}

export { buildCodeDisciplineLogGroup, ruleLogGroup, runLogGroup, sourceScanLogGroup };
