import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultTarget = "/home/mirmachynka/projects/tech/major/project_05/code/platform";
const targetRoot = path.resolve(process.env.CD_BENCHMARK_TARGET || process.argv[2] || defaultTarget);
const rules = [
  "banned-patterns",
  "banned-files",
  "min-file-lines",
  "min-declaration-name",
  "max-file-lines",
  "max-characters-per-line",
  "max-function-lines",
  "redundant-path-segments",
  "imports",
  "remove-comments",
  "structural-blank-lines",
  "dry",
  "format",
];
const { codeDiscipline, loadResolvedCodeDisciplineConfig } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);
const loaded = await loadResolvedCodeDisciplineConfig(repoRoot);

async function measure(label, onlyRules) {
  const startedAt = performance.now();
  const result = await codeDiscipline({
      ...loaded.config,
      projectRoot: targetRoot,
      configPath: loaded.configPath,
      mode: "check",
      onlyRules,
      logging: {
        ...loaded.config.logging,
        warnings: false,
      },
  });
  return {
    label,
    milliseconds: Math.round(performance.now() - startedAt),
    ok: result.ok,
    violations: result.violationCount,
  };
}

const rows = [];

rows.push(await measure("full", undefined));
for (const rule of rules) {
  rows.push(await measure(rule, [rule]));
}

const width = Math.max(...rows.map((row) => row.label.length), "rule".length);

console.log(`target ${targetRoot}`);
console.log(`${"rule".padEnd(width)}  ms       ok     violations`);
for (const row of rows) {
  console.log(`${row.label.padEnd(width)}  ${String(row.milliseconds).padStart(7)}  ${String(row.ok).padEnd(5)}  ${row.violations}`);
}
