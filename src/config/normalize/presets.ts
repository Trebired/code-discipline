import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type {
  BannedFileRuleEntry,
  BannedPatternRuleEntry,
  CodeDisciplineConfig,
  CodeDisciplinePresetName,
  CodeDisciplinePresets,
} from "#uqbg4indzud7";
import { isPlainRecord, normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import {
  getCodeDisciplinePresetConfig,
  isCodeDisciplinePresetName,
} from "#w8wj3kwc4ejx";
import { createNodeProcessBoundaryConfig } from "./node-process-boundary.js";
import { normalizeAllowedFiles } from "./path-lists.js";

function assertKnownPresetKeys(presets: CodeDisciplinePresets | undefined): void {
  if (!presets) return;

  for (const key of Object.keys(presets)) {
    if (key !== "use" && key !== "nodeProcessBoundary") {
      throw new InvalidCodeDisciplineConfigError(`Unknown presets.${key} config key`, {
          key: `presets.${key}`,
      });
    }
  }
}

function normalizePresetUse(value: CodeDisciplinePresets["use"]): CodeDisciplinePresetName[] {
  if (value === undefined) return [];
  const entries = Array.isArray(value) ? value : [value];
  const names: CodeDisciplinePresetName[] = [];

  for (const entry of entries) {
    if (!isCodeDisciplinePresetName(entry)) {
      throw new InvalidCodeDisciplineConfigError(`Unknown code discipline preset: ${String(entry)}`, {
          preset: entry,
      });
    }

    names.push(entry);
  }

  return Array.from(new Set(names));
}

function readBannedPatternEntry(entry: BannedPatternRuleEntry): { value: string; allowedFiles: string[] } | undefined {
  const value = typeof entry === "string"
  ? entry.trim()
  : typeof entry?.value === "string"
  ? entry.value.trim()
  : "";
  if (!value) return undefined;

  return {
    value,
    allowedFiles: typeof entry === "string" ? [] : normalizeAllowedFiles(entry.allowedFiles),
  };
}

function readBannedFileEntry(entry: BannedFileRuleEntry): { glob: string } | undefined {
  const glob = typeof entry === "string"
  ? entry.trim()
  : typeof entry?.glob === "string"
  ? entry.glob.trim()
  : "";
  return glob ? { glob: normalizeRelativePath(glob) } : undefined;
}

function mergeBannedPatternArrays(base: unknown[], override: unknown[]): BannedPatternRuleEntry[] {
  const byValue = new Map<string, {value:string;allowedFiles:string[]}>();
  const invalidEntries: unknown[] = [];

  for (const entry of [...base, ...override]) {
    const normalized = readBannedPatternEntry(entry as BannedPatternRuleEntry);
    if (!normalized) {
      invalidEntries.push(entry);
      continue;
    }

    const key = normalized.value.toLowerCase();
    const current = byValue.get(key);
    byValue.set(key, {
        value: current?.value ?? normalized.value,
        allowedFiles: uniqueStrings([
            ...(current?.allowedFiles ?? []),
            ...normalized.allowedFiles,
        ]),
    });
  }

  return [
    ...Array.from(byValue.values()),
    ...invalidEntries as BannedPatternRuleEntry[],
  ];
}

function mergeBannedFileArrays(base: unknown[], override: unknown[]): BannedFileRuleEntry[] {
  const byGlob = new Map<string, {glob:string}>();
  const invalidEntries: unknown[] = [];

  for (const entry of [...base, ...override]) {
    const normalized = readBannedFileEntry(entry as BannedFileRuleEntry);
    if (!normalized) {
      invalidEntries.push(entry);
      continue;
    }

    byGlob.set(normalized.glob, normalized);
  }

  return [
    ...Array.from(byGlob.values()),
    ...invalidEntries as BannedFileRuleEntry[],
  ];
}

function mergeArrayValues(path: string, base: unknown, override: unknown[]): unknown[] {
  const baseArray = Array.isArray(base) ? base : [];
  if (path === "rules.bannedPatterns.patterns") return mergeBannedPatternArrays(baseArray, override);
  if (path === "rules.bannedFiles.patterns") return mergeBannedFileArrays(baseArray, override);

  const entries = [...baseArray, ...override];
  const seen = new Set<string>();
  const merged: unknown[] = [];

  for (const entry of entries) {
    const key = typeof entry === "string" ? `s:${entry}` : `j:${JSON.stringify(entry)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

function mergeConfigRecord(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
  path = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;

    const childPath = path ? `${path}.${key}` : key;
    const existing = result[key];

    if (Array.isArray(value)) {
      result[key] = mergeArrayValues(childPath, existing, value);
      continue;
    }

    if (isPlainRecord(existing) && isPlainRecord(value)) {
      result[key] = mergeConfigRecord(existing, value, childPath);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function createNamedPresetConfig(presets: CodeDisciplinePresets | undefined): CodeDisciplineConfig {
  const names = normalizePresetUse(presets?.use);
  let config: CodeDisciplineConfig = {};

  for (const name of names) {
    config = mergeConfigRecord(
      config as Record<string, unknown>,
      getCodeDisciplinePresetConfig(name) as Record<string, unknown>,
    ) as CodeDisciplineConfig;
  }

  return config;
}

function resolveCodeDisciplinePresetConfig<T extends{presets?:CodeDisciplinePresets}>(options: T): T {
  assertKnownPresetKeys(options.presets);
  const namedPresetConfig = createNamedPresetConfig(options.presets);
  const nodeProcessBoundaryConfig = createNodeProcessBoundaryConfig(options.presets?.nodeProcessBoundary);
  const resolved = mergeConfigRecord(
    mergeConfigRecord(namedPresetConfig as Record<string, unknown>, nodeProcessBoundaryConfig as Record<string, unknown>),
    options as Record<string, unknown>,
  );
  delete resolved.presets;
  return resolved as T;
}

const applyCodeDisciplinePresets = resolveCodeDisciplinePresetConfig;

export { applyCodeDisciplinePresets, resolveCodeDisciplinePresetConfig };
