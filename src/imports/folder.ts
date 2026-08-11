import fs from "node:fs/promises";
import path from "node:path";
import { collectPackageJsonAliasImports } from "#51kcncizdqcz";
import {
  isInsideDirectory,
  normalizeDotPrefixedTarget,
  parseTsconfigJson,
  pathExists,
  stableSerialize,
  toPosixPath,
  toStableJson,
} from "#ntve5i5a0mol";
import { generateAliasId } from "./strategies.js";
import { resolveProjectPathTarget } from "./resolve.js";
import { readTsconfig } from "./aliases.js";
import type {
  AliasRecord,
  NormalizedImportsOptions,
  ScannedSourceFile,
  SyncAliasesResult,
  TsconfigJson,
} from "./types.js";
import type { NormalizedCodeDisciplineLogger } from "#uljkt8i26p4t";

const IMPORTS_FOLDER_DIR = ".trebired/code-discipline/imports";
const GENERATED_TSCONFIG_PATH = ".trebired/code-discipline/generated/tsconfig.paths.json";

type ImportsFolderState = {
  entryCounts: Array<{filePath:string;count:number}>;
  map: Record<string, string>;
  stableFiles: Record<string, Record<string, string>>;
};

function resolveImportsFolderPath(options: NormalizedImportsOptions): string {
  const input = options.output.type === "alias-map" ? options.output.dir : IMPORTS_FOLDER_DIR;
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(options.projectRoot, input);
}

function resolveGeneratedTsconfigPath(options: NormalizedImportsOptions): string {
  const input = options.output.type === "alias-map" ? options.output.generatedTsconfigPath : GENERATED_TSCONFIG_PATH;
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

function buildGeneratedTsconfig(options: NormalizedImportsOptions, aliasPathMap: Record<string, string>): TsconfigJson {
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

async function readImportsFolderState(options: NormalizedImportsOptions): Promise<ImportsFolderState> {
  const importsFolderPath = resolveImportsFolderPath(options);
  const map: Record<string, string> = {};
  const stableFiles: Record<string, Record<string, string>> = {};
  const entryCounts: Array<{filePath:string;count:number}> = [];
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

async function readGeneratedTsconfig(options: NormalizedImportsOptions): Promise<TsconfigJson|null> {
  const generatedTsconfigPath = resolveGeneratedTsconfigPath(options);
  if (!await pathExists(generatedTsconfigPath)) return null;
  return parseTsconfigJson(await fs.readFile(generatedTsconfigPath, "utf8"), generatedTsconfigPath);
}

function collectGeneratedTsconfigAliasPaths(
  options: NormalizedImportsOptions,
  generatedTsconfig: TsconfigJson | null,
): Record<string, string> {
  const paths = generatedTsconfig?.compilerOptions?.paths ?? {};
  const generatedTsconfigPath = resolveGeneratedTsconfigPath(options);
  const aliasPathMap: Record<string, string> = {};
  for (const [aliasId, targets] of Object.entries(paths).sort(([left], [right]) => left.localeCompare(right))) {
    const firstTarget = targets[0];
    if (typeof firstTarget !== "string") continue;
    aliasPathMap[aliasId] = normalizeDotPrefixedTarget(
      toPosixPath(path.relative(options.projectRoot, path.resolve(path.dirname(generatedTsconfigPath), firstTarget))),
    );
  }
  return sortStringRecord(aliasPathMap);
}

async function readAliasMapAliasPaths(options: NormalizedImportsOptions): Promise<Record<string, string>> {
  return sortStringRecord({
      ...collectGeneratedTsconfigAliasPaths(options, await readGeneratedTsconfig(options)),
      ...(await readImportsFolderState(options)).map,
  });
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
  options: NormalizedImportsOptions,
  aliasPathMap: Record<string, string>,
): Promise<void> {
  const importsFolderPath = resolveImportsFolderPath(options);
  await fs.mkdir(importsFolderPath, { recursive: true });
  const existingJsonFiles = (await fs.readdir(importsFolderPath, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
  .map((entry) => path.join(importsFolderPath, entry.name));
  await Promise.all(existingJsonFiles.map((filePath) => fs.unlink(filePath)));
  const maxEntriesPerFile = options.output.type === "alias-map" ? options.output.maxEntriesPerFile : 1000;
  for (const [filename, entries] of Object.entries(splitAliasPathMap(aliasPathMap, maxEntriesPerFile))) {
    await fs.writeFile(path.join(importsFolderPath, filename), toStableJson(entries));
  }
}

async function writeGeneratedTsconfig(
  options: NormalizedImportsOptions,
  aliasPathMap: Record<string, string>,
): Promise<void> {
  const generatedTsconfigPath = resolveGeneratedTsconfigPath(options);
  await fs.mkdir(path.dirname(generatedTsconfigPath), { recursive: true });
  await fs.writeFile(generatedTsconfigPath, toStableJson(buildGeneratedTsconfig(options, aliasPathMap)));
}

async function resolveAliasTargetToSourcePath(
  options: NormalizedImportsOptions,
  targetPath: string,
): Promise<string|null> {
  const absoluteTarget = path.resolve(options.projectRoot, targetPath);
  const resolvedTarget = await resolveProjectPathTarget(absoluteTarget, options.sourceExtensions);
  if (!resolvedTarget || !isInsideDirectory(resolvedTarget, options.sourceRoot)) return null;
  return resolvedTarget;
}

async function writeImportsFolderAliases(
  options: NormalizedImportsOptions,
  aliasPathMap: Record<string, string>,
): Promise<void> {
  await writeImportsFolder(options, aliasPathMap);
  await writeGeneratedTsconfig(options, aliasPathMap);
}

async function removeAliasMapState(options: NormalizedImportsOptions): Promise<boolean> {
  const importsFolderPath = resolveImportsFolderPath(options);
  const generatedTsconfigPath = resolveGeneratedTsconfigPath(options);
  const importsFolderExists = await pathExists(importsFolderPath);
  const generatedTsconfigExists = await pathExists(generatedTsconfigPath);
  if (importsFolderExists) {
    await fs.rm(importsFolderPath, { recursive: true, force: true });
  }
  if (generatedTsconfigExists) {
    await fs.rm(generatedTsconfigPath, { force: true });
  }
  return importsFolderExists || generatedTsconfigExists;
}

async function planImportsFolderAliases(
  options: NormalizedImportsOptions,
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
  const preservedAliasPathMap: Record<string, string> = {};
  const preservedAliasesByPath = new Map<string, string>();
  for (const [aliasId, targetPath] of Object.entries(migratedAliasPathMap)) {
    const resolvedTarget = await resolveAliasTargetToSourcePath(options, targetPath);
    if (resolvedTarget && sourceFilesByPath.has(resolvedTarget) && !preservedAliasesByPath.has(resolvedTarget)) {
      preservedAliasesByPath.set(resolvedTarget, aliasId);
      preservedAliasPathMap[aliasId] = normalizeDotPrefixedTarget(sourceFilesByPath.get(resolvedTarget)!.relativeFromProjectRoot);
    }
  }
  const reservedIds = new Set<string>(Object.keys(preservedAliasPathMap));
  const aliasRecords: AliasRecord[] = [];
  const managedAliasPathMap: Record<string, string> = { ...preservedAliasPathMap };
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
  const maxEntriesPerFile = options.output.type === "alias-map" ? options.output.maxEntriesPerFile : 1000;
  const nextImportsFiles = splitAliasPathMap(aliasPathMap, maxEntriesPerFile);
  const generatedTsconfig = buildGeneratedTsconfig(options, aliasPathMap);
  const currentGeneratedTsconfig = await readGeneratedTsconfig(options);
  const rootTsconfigWithoutPaths = removeInlineTsconfigPaths(config);
  const nextRootTsconfig = addGeneratedExtends(rootTsconfigWithoutPaths, options.tsconfigPath, resolveGeneratedTsconfigPath(options));
  const maxEntriesExceeded = importsFolderState.entryCounts
  .filter((entry) => entry.count > maxEntriesPerFile)
  .map((entry) => ({ filePath: entry.filePath, count: entry.count, max: maxEntriesPerFile }));
  const rootProjectionChanged = stableSerialize(originalConfig) !== stableSerialize(nextRootTsconfig);
  const drift = {
    generatedTsconfigChanged: stableSerialize(currentGeneratedTsconfig ?? {}) !== stableSerialize(generatedTsconfig),
    importsFolderChanged: stableSerialize(importsFolderState.stableFiles) !== stableSerialize(nextImportsFiles),
    inlineTsconfigPaths: Boolean(config.compilerOptions?.paths),
    maxEntriesExceeded,
    rootExtendsChanged: rootProjectionChanged
    &&(!hasGeneratedExtends(config, options.tsconfigPath, resolveGeneratedTsconfigPath(options))
      ||Boolean(config.compilerOptions?.paths)
      ||Boolean(config.compilerOptions?.baseUrl)),
  };
  return {
    aliasesChanged: drift.importsFolderChanged
    ||drift.generatedTsconfigChanged
    ||drift.inlineTsconfigPaths
    ||drift.rootExtendsChanged
    ||maxEntriesExceeded.length > 0,
    aliasesCount: aliasRecords.length,
    aliasPathMap,
    aliasRecords,
    drift,
    tsconfig: nextRootTsconfig,
  };
}

export { planImportsFolderAliases, readAliasMapAliasPaths, removeAliasMapState, writeImportsFolderAliases };
