import type { CodeDisciplineConfig, NodeProcessBoundaryPresetOptions } from "#uqbg4indzud7";
import { normalizeAllowedFiles } from "./path-lists.js";

const NODE_PROCESS_ENV_PATTERNS = [
  "process.env",
  "process[\"env\"]",
  "process['env']",
];

const NODE_PROCESS_RUNTIME_PATTERNS = [
  "process.argv",
  "process.cwd(",
  "process.exit(",
  "process.pid",
  "process.platform",
  "process.arch",
  "process.memoryUsage(",
  "process.stdin",
  "process.stdout",
  "process.stderr",
  "process.on(",
];

function createNodeProcessBoundaryConfig(
  options: NodeProcessBoundaryPresetOptions | undefined,
): CodeDisciplineConfig {
  if (!options) return {};

  const envAllowed = normalizeAllowedFiles(options.envBoundaryFiles);
  const processAllowed = normalizeAllowedFiles(options.processBoundaryFiles);
  const patterns = [
    ...NODE_PROCESS_ENV_PATTERNS.map((value) => ({ value, allowedFiles: envAllowed })),
    ...NODE_PROCESS_RUNTIME_PATTERNS.map((value) => ({ value, allowedFiles: processAllowed })),
  ];

  return {
    rules: {
      bannedPatterns: {
        patterns,
      },
    },
  };
}

export { createNodeProcessBoundaryConfig };
