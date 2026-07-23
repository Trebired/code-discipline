import fs from "node:fs/promises";
import path from "node:path";

import { collectPackageJsonAliasImports } from "../runtime/imports-sync.js";
import {
  isInsideDirectory,
  normalizeDotPrefixedTarget,
  parseTsconfigJson,
  pathExists,
  stableSerialize,
  toPosixPath,
  toStableJson,
} from "../shared/utils.js";
import { generateAliasId } from "./strategies.js";
import { resolveProjectPathTarget } from "./resolve.js";
import { readTsconfig } from "./aliases.js";
import type {
  AliasRecord,
  NormalizedSyncImportsOptions,
  ScannedSourceFile,
  SyncAliasesResult,
  TsconfigJson,
} from "./types.js";
import type { NormalizedCodeDisciplineLogger } from "../shared/logging-types.js";

type ImportsFolderState = {
  entryCounts: Array<{ filePath: string; count: number }>;
  map: Record<string, string>;
  stableFiles: Record<string, Record<string, string>>;
};

function resolveImportsFolderPath(options: NormalizedSyncImportsOptions): string {
  const input = options.importsFolder.dir;
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(options.projectRoot, input);
}

function resolveGeneratedTsconfigPath(options: NormalizedSyncImportsOptions): string {
  const input = options.generatedTsconfig.path;
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(options.projectRoot, input);
}

function sortStringRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function toGeneratedTsconfigTarget(projectRoot: string, generatedTsconfigPath: string, targetPath: string): string {
  const absoluteTarget = path.resolve(projectRoot, targetPath);
  const relative = toPosixPath(path.relative(path.dirname(generatedTsconfigPath), absoluteTarget));
  if (relative.startsWith("../")) return relative;
  return relative.startsWith("./") ? relative : `./${relative}`;
}

function toRootTsconfigExtendsTarget(tsconfigPath: string, generatedTsconfigPath: string): string {
  const relative = toPosixPath(path.relative(path.dirname(tsconfigPath), generatedTsconfigPath));
  if (relative.startsWith("../")) return relative;
  return relative.startsWith("./") ? relative : `./${relative}`;
}

function normalizeTsconfigExtendsTarget(tsconfigPath: string, target: string): string {
  return path.resolve(path.dirname(tsconfigPath), target);
}

function hasGeneratedExtends(tsconfig: TsconfigJson, tsconfigPath: string, generatedTsconfigPath: string): boolean {
  const current = tsconfig.extends;
  if (typeof current === "string") {
    return normalizeTsconfigExtendsTarget(tsconfigPath, current) === generatedTsconfigPath;
  }

  if (Array.isArray(current)) {
    return current.some((entry) => typeof entry === "string" && normalizeTsconfigExtendsTarget(tsconfigPath, entry) === generatedTsconfigPath);
  }

  return false;
}

function addGeneratedExtends(tsconfig: TsconfigJson, tsconfigPath: string, generatedTsconfigPath: string): TsconfigJson {
  if (hasGeneratedExtends(tsconfig, tsconfigPath, generatedTsconfigPath)) return tsconfig;

  const generatedTarget = toRootTsconfigExtendsTarget(tsconfigPath, generatedTsconfigPath);
  const current = tsconfig.extends;

  if (typeof current === "string") {
    return {
      ...tsconfig,
      extends: [current, generatedTarget],
    };
  }

  if (Array.isArray(current)) {
    return {
      ...tsconfig,
      extends: [...current.filter((entry): entry is string => typeof entry === "string"), generatedTarget],
    };
  }

  return {
    ...tsconfig,
    extends: generatedTarget,
  };
}

function removeInlineTsconfigPaths(tsconfig: TsconfigJson): TsconfigJson {
  const compilerOptions = { ...(tsconfig.compilerOptions ?? {}) };
  delete compilerOptions.paths;
  delete compilerOptions.baseUrl;

  return {
    ...tsconfig,
    compilerOptions,
  };
}

function buildGeneratedTsconfig(options: NormalizedSyncImportsOptions, aliasPathMap: Record<string, string>): TsconfigJson {
  const generatedTsconfigPath = resolveGeneratedTsconfigPath(options);
  const paths: Record<string, string[]> = {};

  for (const [aliasId, targetPath] of Object.entries(aliasPathMap).sort(([left], [right]) => left.localeCompare(right))) {
    paths[aliasId] = [toGeneratedTsconfigTarget(options.projectRoot, generatedTsconfigPath, targetPath)];
  }

  return {
    compilerOptions: {
      paths,
    },
  };
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  const text = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }

  return parsed as Record<string, unknown>;
}

async function readImportsFolderState(options: NormalizedSyncImportsOptions): Promise<ImportsFolderState> {
  const importsFolderPath = resolveImportsFolderPath(options);
  const map: Record<string, string> = {};
  const stableFiles: Record<string, Record<string, string>> = {};
  const entryCounts: Array<{ filePath: string; count: number }> = [];

  if (!await pathExists(importsFolderPath)) return { entryCounts, map, stableFiles };

  const entries = (await fs.readdir(importsFolderPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  for (const filename of entries) {
    const filePath = path.join(importsFolderPath, filename);
    const parsed = await readJsonObject(filePath);
    const normalizedFile: Record<string, string> = {};

    for (const [aliasId, target] of Object.entries(parsed).sort(([left], [right]) => left.localeCompare(right))) {
      if (typeof target !== "string") {
        throw new Error(`${filePath} alias ${aliasId} must point to a string target path`);
      }

      normalizedFile[aliasId] = normalizeDotPrefixedTarget(target);
      if (!(aliasId in map)) map[aliasId] = normalizedFile[aliasId];
    }

    entryCounts.push({ filePath, count: Object.keys(normalizedFile).length });
    stableFiles[filename] = sortStringRecord(normalizedFile);
  }

  return {
    entryCounts,
    map: sortStringRecord(map),
    stableFiles,
  };
}

function splitAliasPathMap(
  aliasPathMap: Record<string, string>,
  maxEntriesPerFile: number,
): Record<string, Record<string, string>> {
  const entries = Object.entries(aliasPathMap).sort(([left], [right]) => left.localeCompare(right));
  const files: Record<string, Record<string, string>> = {};

  for (let index = 0; index < entries.length; index += maxEntriesPerFile) {
    const chunk = entries.slice(index, index + maxEntriesPerFile);
    files[`${Math.floor(index / maxEntriesPerFile) + 1}.json`] = Object.fromEntries(chunk);
  }

  return files;
}

async function readGeneratedTsconfig(options: NormalizedSyncImportsOptions): Promise<TsconfigJson | null> {
  const generatedTsconfigPath = resolveGeneratedTsconfigPath(options);
  if (!await pathExists(generatedTsconfigPath)) return null;
  return parseTsconfigJson(await fs.readFile(generatedTsconfigPath, "utf8"), generatedTsconfigPath);
}

function collectTsconfigAliasPaths(tsconfig: TsconfigJson): Record<string, string> {
  const paths = tsconfig.compilerOptions?.paths ?? {};
  const aliasPathMap: Record<string, string> = {};

  for (const [aliasId, targets] of Object.entries(paths).sort(([left], [right]) => left.localeCompare(right))) {
    const firstTarget = targets[0];
    if (typeof firstTarget === "string") aliasPathMap[aliasId] = normalizeDotPrefixedTarget(firstTarget);
  }

  return aliasPathMap;
}

async function writeImportsFolder(
  options: NormalizedSyncImportsOptions,
  aliasPathMap: Record<string, string>,
): Promise<void> {
  const importsFolderPath = resolveImportsFolderPath(options);
  await fs.mkdir(importsFolderPath, { recursive: true });

  const existingJsonFiles = (await fs.readdir(importsFolderPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(importsFolderPath, entry.name));

  await Promise.all(existingJsonFiles.map((filePath) => fs.unlink(filePath)));

  for (const [filename, entries] of Object.entries(splitAliasPathMap(aliasPathMap, options.importsFolder.maxEntriesPerFile))) {
    await fs.writeFile(path.join(importsFolderPath, filename), toStableJson(entries));
  }
}

async function writeGeneratedTsconfig(
  options: NormalizedSyncImportsOptions,
  aliasPathMap: Record<string, string>,
): Promise<void> {
  if (!options.generatedTsconfig.enabled) return;

  const generatedTsconfigPath = resolveGeneratedTsconfigPath(options);
  await fs.mkdir(path.dirname(generatedTsconfigPath), { recursive: true });
  await fs.writeFile(generatedTsconfigPath, toStableJson(buildGeneratedTsconfig(options, aliasPathMap)));
}

async function resolveAliasTargetToSourcePath(
  options: NormalizedSyncImportsOptions,
  targetPath: string,
): Promise<string | null> {
  const absoluteTarget = path.resolve(options.projectRoot, targetPath);
  const resolvedTarget = await resolveProjectPathTarget(absoluteTarget, options.sourceExtensions);
  if (!resolvedTarget || !isInsideDirectory(resolvedTarget, options.sourceRoot)) return null;
  return resolvedTarget;
}

async function writeImportsFolderAliases(
  options: NormalizedSyncImportsOptions,
  aliasPathMap: Record<string, string>,
): Promise<void> {
  await writeImportsFolder(options, aliasPathMap);
  await writeGeneratedTsconfig(options, aliasPathMap);
}

async function planImportsFolderAliases(
  options: NormalizedSyncImportsOptions,
  sourceFiles: ScannedSourceFile[],
  logger?: NormalizedCodeDisciplineLogger,
): Promise<SyncAliasesResult> {
  const { config, originalConfig } = await readTsconfig(options, logger);
  const importsFolderState = await readImportsFolderState(options);
  const sourceFilesByPath = new Map(sourceFiles.map((file) => [file.absolutePath, file]));
  const migratedAliasPathMap = sortStringRecord({
    ...collectTsconfigAliasPaths(config),
    ...await collectPackageJsonAliasImports({
      configPath: options.configPath,
      options: options.packageJsonImports,
      projectRoot: options.projectRoot,
    }),
    ...importsFolderState.map,
  });
  const preservedAliasesByPath = new Map<string, string>();

  for (const [aliasId, targetPath] of Object.entries(migratedAliasPathMap)) {
    const resolvedTarget = await resolveAliasTargetToSourcePath(options, targetPath);
    if (resolvedTarget && sourceFilesByPath.has(resolvedTarget) && !preservedAliasesByPath.has(resolvedTarget)) {
      preservedAliasesByPath.set(resolvedTarget, aliasId);
    }
  }

  const reservedIds = new Set<string>(Object.keys(migratedAliasPathMap));
  const aliasRecords: AliasRecord[] = [];
  const managedAliasPathMap: Record<string, string> = { ...migratedAliasPathMap };

  for (const file of sourceFiles) {
    const preservedAlias = preservedAliasesByPath.get(file.absolutePath);
    const aliasId = preservedAlias ?? generateAliasId(file, options, Array.from(reservedIds));
    reservedIds.add(aliasId);
    managedAliasPathMap[aliasId] = normalizeDotPrefixedTarget(file.relativeFromProjectRoot);
    aliasRecords.push({
      id: aliasId,
      absolutePath: file.absolutePath,
      relativeFromProjectRoot: file.relativeFromProjectRoot,
    });
  }

  const aliasPathMap = sortStringRecord(managedAliasPathMap);
  const nextImportsFiles = splitAliasPathMap(aliasPathMap, options.importsFolder.maxEntriesPerFile);
  const generatedTsconfig = options.generatedTsconfig.enabled ? buildGeneratedTsconfig(options, aliasPathMap) : null;
  const currentGeneratedTsconfig = options.generatedTsconfig.enabled ? await readGeneratedTsconfig(options) : null;
  const rootTsconfigWithoutPaths = removeInlineTsconfigPaths(config);
  const nextRootTsconfig = options.generatedTsconfig.enabled
    ? addGeneratedExtends(rootTsconfigWithoutPaths, options.tsconfigPath, resolveGeneratedTsconfigPath(options))
    : rootTsconfigWithoutPaths;
  const maxEntriesExceeded = importsFolderState.entryCounts
    .filter((entry) => entry.count > options.importsFolder.maxEntriesPerFile)
    .map((entry) => ({ filePath: entry.filePath, count: entry.count, max: options.importsFolder.maxEntriesPerFile }));
  const rootProjectionChanged = stableSerialize(originalConfig) !== stableSerialize(nextRootTsconfig);
  const drift = {
    generatedTsconfigChanged: options.generatedTsconfig.enabled
      ? stableSerialize(currentGeneratedTsconfig ?? {}) !== stableSerialize(generatedTsconfig)
      : false,
    importsFolderChanged: stableSerialize(importsFolderState.stableFiles) !== stableSerialize(nextImportsFiles),
    inlineTsconfigPaths: Boolean(config.compilerOptions?.paths),
    maxEntriesExceeded,
    rootExtendsChanged: rootProjectionChanged
      && (options.generatedTsconfig.enabled && !hasGeneratedExtends(config, options.tsconfigPath, resolveGeneratedTsconfigPath(options))
        || Boolean(config.compilerOptions?.paths)
        || Boolean(config.compilerOptions?.baseUrl)),
  };

  return {
    aliasesChanged: drift.importsFolderChanged
      || drift.generatedTsconfigChanged
      || drift.inlineTsconfigPaths
      || drift.rootExtendsChanged
      || maxEntriesExceeded.length > 0,
    aliasesCount: aliasRecords.length,
    aliasPathMap,
    aliasRecords,
    drift,
    tsconfig: nextRootTsconfig,
  };
}

export { planImportsFolderAliases, writeImportsFolderAliases };
