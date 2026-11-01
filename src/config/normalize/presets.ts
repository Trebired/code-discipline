import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type {
  BannedFileRuleEntry,
  BannedPatternRuleEntry,
  CodeDisciplineConfig,
  CodeDisciplinePresets,
} from "#uqbg4indzud7";
import { isPlainRecord, normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import { CODE_DISCIPLINE_PACKAGE_VERSION } from "#ik5y0pee4ah1";
import { importConfigModule } from "#rpaq8jfzp0xk";
import { loadPresets } from "@trebired/utils";
import { createNodeProcessBoundaryConfig } from "./node-process-boundary.js";
import { normalizeAllowedFiles } from "./path-lists.js";

type PresetResolutionContext = {
  projectRoot: string;
};

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

async function loadNamedPresets(presets: CodeDisciplinePresets | undefined, context: PresetResolutionContext) {
  try {
    return await loadPresets({
        importModule: (file) => importConfigModule(context.projectRoot, file),
        label: "code-discipline",
        packageName: "code-discipline",
        packageVersion: CODE_DISCIPLINE_PACKAGE_VERSION,
        presets,
        projectRoot: context.projectRoot,
    });
  } catch (error) {
    throw new InvalidCodeDisciplineConfigError(error instanceof Error ? error.message : String(error), {
        presets: presets?.use,
    });
  }
}

async function createNamedPresetConfig(
  presets: CodeDisciplinePresets | undefined,
  context: PresetResolutionContext,
): Promise<CodeDisciplineConfig> {
  let config: Record<string, unknown> = {};
  for (const preset of await loadNamedPresets(presets, context)) {
    config = mergeConfigRecord(config, preset.config);
  }
  return config as CodeDisciplineConfig;
}

async function resolvePresetConfig<T extends{presets?:CodeDisciplinePresets;helpers?:{nodeProcessBoundary?:unknown}}>(
  options: T,
  context: PresetResolutionContext,
): Promise<T> {
  const namedPresetConfig = await createNamedPresetConfig(options.presets, context);
  const nodeProcessBoundaryConfig = createNodeProcessBoundaryConfig(options.helpers?.nodeProcessBoundary as never);
  const resolved = mergeConfigRecord(
    mergeConfigRecord(namedPresetConfig as Record<string, unknown>, nodeProcessBoundaryConfig as Record<string, unknown>),
    options as Record<string, unknown>,
  );
  delete resolved.presets;
  delete resolved.helpers;
  return resolved as T;
}

const applyPresets = resolvePresetConfig;

export {
  applyPresets,
  resolvePresetConfig,
};
