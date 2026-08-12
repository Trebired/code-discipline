import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import type {
  BannedFileRuleEntry,
  BannedPatternRuleEntry,
  CodeDisciplineConfig,
  CodeDisciplinePresetPackage,
  CodeDisciplinePresets,
} from "#uqbg4indzud7";
import { isPlainRecord, normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";
import { CODE_DISCIPLINE_PACKAGE_NAME, CODE_DISCIPLINE_PACKAGE_VERSION } from "#ik5y0pee4ah1";
import { createNodeProcessBoundaryConfig } from "./node-process-boundary.js";
import { normalizeAllowedFiles } from "./path-lists.js";

type PackageJson = {
  name?: string;
  peerDependencies?: Record<string, string>;
};
type PresetResolutionContext = {
  projectRoot: string;
};

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu;

function defineCodeDisciplinePreset(preset: CodeDisciplinePresetPackage): CodeDisciplinePresetPackage {
  return preset;
}

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

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function findPackageJsonPath(modulePath: string): Promise<string> {
  let current = path.dirname(modulePath);

  while (true) {
    const candidate = path.join(current, "package.json");
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new InvalidCodeDisciplineConfigError("Preset package package.json was not found", {
      modulePath,
  });
}

function assertExactCodeDisciplineVersion(packageName: string, packageJson: PackageJson, preset: CodeDisciplinePresetPackage): void {
  if (preset.codeDisciplineVersion !== CODE_DISCIPLINE_PACKAGE_VERSION) {
    const message = [
      `Preset ${packageName} requires ${CODE_DISCIPLINE_PACKAGE_NAME}@${preset.codeDisciplineVersion},`,
      `but the running version is ${CODE_DISCIPLINE_PACKAGE_VERSION}`,
    ].join(" ");
    throw new InvalidCodeDisciplineConfigError(
      message,
      {
        preset: packageName,
        expected: CODE_DISCIPLINE_PACKAGE_VERSION,
        actual: preset.codeDisciplineVersion,
      },
    );
  }

  const peerVersion = packageJson.peerDependencies?.[CODE_DISCIPLINE_PACKAGE_NAME];
  if (peerVersion !== CODE_DISCIPLINE_PACKAGE_VERSION) {
    throw new InvalidCodeDisciplineConfigError(
      `Preset ${packageName} must declare peerDependencies.${CODE_DISCIPLINE_PACKAGE_NAME} exactly as ${CODE_DISCIPLINE_PACKAGE_VERSION}`,
      {
        preset: packageName,
        expected: CODE_DISCIPLINE_PACKAGE_VERSION,
        actual: peerVersion,
      },
    );
  }
}

function readPresetPackageExport(packageName: string, imported: unknown): CodeDisciplinePresetPackage {
  const exported = isPlainRecord(imported) && "default"in imported
  ? imported.default
  : imported;
  if (!isPlainRecord(exported)) {
    throw new InvalidCodeDisciplineConfigError(`Preset ${packageName} must default-export a preset object`, {
        preset: packageName,
    });
  }

  if (typeof exported.codeDisciplineVersion !== "string" || !exported.codeDisciplineVersion.trim()) {
    throw new InvalidCodeDisciplineConfigError(`Preset ${packageName} must declare codeDisciplineVersion`, {
        preset: packageName,
    });
  }

  if (!isPlainRecord(exported.config)) {
    throw new InvalidCodeDisciplineConfigError(`Preset ${packageName} must declare a config object`, {
        preset: packageName,
    });
  }

  if ("presets"in exported.config) {
    throw new InvalidCodeDisciplineConfigError(`Preset ${packageName} config cannot declare nested presets`, {
        preset: packageName,
        key: "config.presets",
    });
  }

  return exported as CodeDisciplinePresetPackage;
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

  const packageJsonPath = await findPackageJsonPath(modulePath);
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath);
  const preset = readPresetPackageExport(packageName, await import(pathToFileURL(modulePath).href));
  assertExactCodeDisciplineVersion(packageName, packageJson, preset);
  return preset.config;
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

async function resolveCodeDisciplinePresetConfig<T extends{presets?:CodeDisciplinePresets;helpers?:{nodeProcessBoundary?:unknown}}>(
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

const applyCodeDisciplinePresets = resolveCodeDisciplinePresetConfig;

export {
  applyCodeDisciplinePresets,
  defineCodeDisciplinePreset,
  resolveCodeDisciplinePresetConfig,
};
