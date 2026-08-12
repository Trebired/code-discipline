import { CODE_DISCIPLINE_LOG_GROUP } from "./constants.js";
import type { CodeDisciplineRuleName } from "./discipline-types.js";

function buildLogGroup(...parts: string[]): string {
  return [CODE_DISCIPLINE_LOG_GROUP, ...parts.filter((part) => part.trim().length > 0)].join(".");
}

function ruleLogGroup(rule: CodeDisciplineRuleName | string): string {
  return buildLogGroup("rules", rule);
}

function runLogGroup(command: string): string {
  return buildLogGroup("runs", command);
}

function sourceScanLogGroup(scope: string): string {
  return buildLogGroup("scan", scope);
}

export { buildLogGroup, ruleLogGroup, runLogGroup, sourceScanLogGroup };
