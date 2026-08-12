import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type {
  BannedFileRuleEntry,
  BannedPatternRuleEntry,
  CodeDisciplineConfig,
  CodeDisciplinePresets,
} from "#uqbg4indzud7";
import { isPlainRecord, normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import { createNodeProcessBoundaryConfig } from "./node-process-boundary.js";
import { normalizeAllowedFiles } from "./path-lists.js";

type PresetResolutionContext = {
  projectRoot: string;
};

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu;

function assertKnownPresetKeys(presets: CodeDisciplinePresets | undefined): void {
  if (!presets) return;

  for (const key of Object.keys(presets)) {
    if (key !== "use") {
      throw new InvalidCodeDisciplineConfigError(`Unknown presets.${key} config key`, {
          key: `presets.${key}`,
      });
    }
  }
}

function normalizePresetUse(value: CodeDisciplinePresets["use"]): string[] {
  if (value === undefined) return [];
  const entries = Array.isArray(value) ? value : [value];
  const names: string[] = [];

  for (const entry of entries) {
    if (!isPresetPackageName(entry)) {
      throw new InvalidCodeDisciplineConfigError(`Code discipline preset must be an npm package name: ${String(entry)}`, {
          preset: entry,
      });
    }

    names.push(entry);
  }

  return Array.from(new Set(names));
}

function isPresetPackageName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed === value
  &&PACKAGE_NAME_PATTERN.test(trimmed)
  &&!trimmed.startsWith(".")
  &&!path.isAbsolute(trimmed)
  &&!new RegExp("^[a-z][a-z0-9+.-]*:", "iu").test(trimmed);
}

function createProjectRequire(projectRoot: string): NodeRequire {
  return createRequire(path.join(projectRoot, "package.json"));
}

function readPresetPackageConfig(packageName: string, imported: unknown): CodeDisciplineConfig {
  const exported = isPlainRecord(imported) && "default"in imported
  ? imported.default
  : imported;
  if (!isPlainRecord(exported)) {
    throw new InvalidCodeDisciplineConfigError(`Preset ${packageName} must default-export a config object`, {
        preset: packageName,
    });
  }

  if ("codeDisciplineVersion"in exported || "config"in exported) {
    throw new InvalidCodeDisciplineConfigError(`Preset ${packageName} must default-export the config object directly`, {
        preset: packageName,
    });
  }

  if ("presets"in exported) {
    throw new InvalidCodeDisciplineConfigError(`Preset ${packageName} config cannot declare nested presets`, {
        preset: packageName,
        key: "presets",
    });
  }

  return exported as CodeDisciplineConfig;
}

async function loadPresetPackageConfig(packageName: string, context: PresetResolutionContext): Promise<CodeDisciplineConfig> {
  const require = createProjectRequire(context.projectRoot);
  let modulePath: string;

  try {
    modulePath = require.resolve(packageName);
  } catch (error) {
    throw new InvalidCodeDisciplineConfigError(`Code discipline preset package was not found: ${packageName}`, {
        preset: packageName,
        cause: error instanceof Error ? error.message : String(error),
    });
  }

  return readPresetPackageConfig(packageName, await import(pathToFileURL(modulePath).href));
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

async function createNamedPresetConfig(
  presets: CodeDisciplinePresets | undefined,
  context: PresetResolutionContext,
): Promise<CodeDisciplineConfig> {
  const names = normalizePresetUse(presets?.use);
  let config: CodeDisciplineConfig = {};

  for (const name of names) {
    config = mergeConfigRecord(
      config as Record<string, unknown>,
      await loadPresetPackageConfig(name, context) as Record<string, unknown>,
    ) as CodeDisciplineConfig;
  }

  return config;
}

async function resolvePresetConfig<T extends{presets?:CodeDisciplinePresets;helpers?:{nodeProcessBoundary?:unknown}}>(
  options: T,
  context: PresetResolutionContext,
): Promise<T> {
  assertKnownPresetKeys(options.presets);
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
