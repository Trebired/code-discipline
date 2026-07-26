import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type {
  BannedPatternRuleEntry,
  CodeDisciplinePresets,
  CodeDisciplineRules,
  NodeProcessBoundaryPresetOptions,
} from "#uqbg4indzud7";
import { isPlainRecord, normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";

const NODE_PROCESS_ENV_PATTERNS = [
  "process.env",
];

const NODE_PROCESS_RUNTIME_PATTERNS = [
  "process.argv",
  "process.cwd(",
  "process.exit(",
  "process.exitCode",
  "process.pid",
  "process.platform",
  "process.arch",
  "process.version",
  "process.memoryUsage(",
  "process.uptime(",
  "process.stdin",
  "process.stdout",
  "process.stderr",
  "process.on(",
  "process.once(",
  "process.kill(",
  "process.execPath",
  "process.getuid(",
  "process.getgid(",
];

function assertKnownPresetKeys(label: string, source: Record<string, unknown>, keys: string[]): void {
  const unsupportedKeys = Object.keys(source).filter((key) => !keys.includes(key));

  if (unsupportedKeys.length > 0) {
    throw new InvalidCodeDisciplineConfigError(`${label} contains unsupported keys`, {
      key: label,
      keys: unsupportedKeys,
    });
  }
}

function normalizeBoundaryFiles(value: unknown, label: string): string[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new InvalidCodeDisciplineConfigError(`${label} must be an array of project-relative file paths`, {
      key: label,
      value,
    });
  }

  return uniqueStrings(
    value
      .map((filePath) => normalizeRelativePath(String(filePath).trim()))
      .filter(Boolean),
  );
}

function normalizeNodeProcessBoundaryPreset(value: unknown): NodeProcessBoundaryPresetOptions | undefined {
  if (value === undefined) return undefined;

  if (!isPlainRecord(value)) {
    throw new InvalidCodeDisciplineConfigError("presets.nodeProcessBoundary must be an object when provided", {
      key: "presets.nodeProcessBoundary",
      value,
    });
  }

  assertKnownPresetKeys("presets.nodeProcessBoundary", value, ["envBoundaryFiles", "processBoundaryFiles"]);

  return {
    envBoundaryFiles: normalizeBoundaryFiles(value.envBoundaryFiles, "presets.nodeProcessBoundary.envBoundaryFiles"),
    processBoundaryFiles: normalizeBoundaryFiles(value.processBoundaryFiles, "presets.nodeProcessBoundary.processBoundaryFiles"),
  };
}

function expandNodeProcessBoundaryPreset(
  preset: NodeProcessBoundaryPresetOptions | undefined,
): BannedPatternRuleEntry[] {
  if (!preset) return [];

  const envBoundaryFiles = preset.envBoundaryFiles ?? [];
  const processBoundaryFiles = preset.processBoundaryFiles ?? [];

  return [
    ...NODE_PROCESS_ENV_PATTERNS.map((value) => ({ value, allowedFiles: envBoundaryFiles })),
    ...NODE_PROCESS_RUNTIME_PATTERNS.map((value) => ({ value, allowedFiles: processBoundaryFiles })),
  ];
}

function normalizePresetPatterns(presets: CodeDisciplinePresets | undefined): BannedPatternRuleEntry[] {
  if (presets === undefined) return [];

  if (!isPlainRecord(presets)) {
    throw new InvalidCodeDisciplineConfigError("presets must be an object when provided", {
      key: "presets",
      value: presets,
    });
  }

  assertKnownPresetKeys("presets", presets, ["nodeProcessBoundary"]);

  return expandNodeProcessBoundaryPreset(
    normalizeNodeProcessBoundaryPreset(presets.nodeProcessBoundary),
  );
}

function mergePresetBannedPatterns(
  rules: CodeDisciplineRules | undefined,
  patterns: BannedPatternRuleEntry[],
): CodeDisciplineRules | undefined {
  if (patterns.length === 0) return rules;

  const bannedPatterns = rules?.bannedPatterns;

  if (bannedPatterns) {
    const manualPatterns = (bannedPatterns as { patterns?: unknown }).patterns;

    if (!Array.isArray(manualPatterns)) {
      throw new InvalidCodeDisciplineConfigError("bannedPatterns.patterns must contain at least one pattern", {
        rule: "bannedPatterns",
      });
    }

    return {
      ...(rules ?? {}),
      bannedPatterns: {
        ...bannedPatterns,
        patterns: [
          ...manualPatterns,
          ...patterns,
        ],
      },
    };
  }

  return {
    ...(rules ?? {}),
    bannedPatterns: {
      patterns,
    },
  };
}

function applyCodeDisciplinePresets(
  rules: CodeDisciplineRules | undefined,
  presets: CodeDisciplinePresets | undefined,
): CodeDisciplineRules | undefined {
  return mergePresetBannedPatterns(rules, normalizePresetPatterns(presets));
}

export {
  applyCodeDisciplinePresets,
};
