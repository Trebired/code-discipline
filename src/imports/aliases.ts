import fs from "node:fs/promises";
import path from "node:path";

import type {
  AliasRecord,
  NormalizedSyncImportsOptions,
  ScannedSourceFile,
  SyncAliasesResult,
  TsconfigJson,
} from "./types.js";
import type { NormalizedCodeDisciplineLogger } from "../shared/logging-types.js";
import { resolveProjectPathTarget } from "./resolve.js";
import { generateAliasId } from "./strategies.js";
import { isInsideDirectory, parseTsconfigJson, pathExists, stableSerialize, toStableJson, wait } from "../shared/utils.js";

const TSCONFIG_READ_RETRY_ATTEMPTS = 20;
const TSCONFIG_READ_RETRY_DELAY_MS = 50;

type ExistingPathsState = {
  preservedAliasesByPath: Map<string, string>;
  passthroughPaths: Record<string, string[]>;
};

function normalizeTargetPath(projectRoot: string, targetPath: string): string | null {
  if (targetPath.includes("*")) return null;
  return path.resolve(projectRoot, targetPath);
}

function sortPathsRecord(pathsMap: Record<string, string[]>): Record<string, string[]> {
  const sorted: Record<string, string[]> = {};
  for (const key of Object.keys(pathsMap).sort((left, right) => left.localeCompare(right))) {
    sorted[key] = [...pathsMap[key]].sort((left, right) => left.localeCompare(right));
  }
  return sorted;
}

async function extractExistingPaths(
  options: NormalizedSyncImportsOptions,
  sourceFilesByPath: Map<string, ScannedSourceFile>,
  existingPaths: Record<string, string[]>,
): Promise<ExistingPathsState> {
  const preservedAliasesByPath = new Map<string, string>();
  const passthroughPaths: Record<string, string[]> = {};

  for (const aliasId of Object.keys(existingPaths).sort((left, right) => left.localeCompare(right))) {
    const targets = existingPaths[aliasId];
    let matchedFilePath: string | null = null;

    for (const target of targets) {
      const absoluteTarget = normalizeTargetPath(options.projectRoot, target);
      if (!absoluteTarget) continue;
      const resolvedTarget = await resolveProjectPathTarget(absoluteTarget, options.sourceExtensions);
      if (resolvedTarget && sourceFilesByPath.has(resolvedTarget)) {
        matchedFilePath = resolvedTarget;
        break;
      }
    }

    if (matchedFilePath && !preservedAliasesByPath.has(matchedFilePath)) {
      preservedAliasesByPath.set(matchedFilePath, aliasId);
      continue;
    }

    const pointsIntoSourceRoot = targets.some((target) => {
      const absoluteTarget = normalizeTargetPath(options.projectRoot, target);
      return absoluteTarget ? isInsideDirectory(absoluteTarget, options.sourceRoot) : false;
    });

    if (!pointsIntoSourceRoot) {
      passthroughPaths[aliasId] = [...targets];
    }
  }

  return {
    preservedAliasesByPath,
    passthroughPaths: sortPathsRecord(passthroughPaths),
  };
}

async function readTsconfig(
  options: NormalizedSyncImportsOptions,
  logger?: NormalizedCodeDisciplineLogger,
): Promise<{ config: TsconfigJson; originalConfig: TsconfigJson }> {
  if (!await pathExists(options.tsconfigPath)) {
    return {
      config: { compilerOptions: {} },
      originalConfig: { compilerOptions: {} },
    };
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= TSCONFIG_READ_RETRY_ATTEMPTS; attempt += 1) {
    const text = await fs.readFile(options.tsconfigPath, "utf8");

    try {
      const parsed = parseTsconfigJson(text, options.tsconfigPath);
      if (attempt > 1) {
        logger?.warn("tsconfig-read-recovered", `tsconfig recovered after retries=${attempt - 1}`, {
          tsconfigPath: options.tsconfigPath,
          retries: attempt - 1,
        });
      }

      return {
        config: parsed,
        originalConfig: parsed,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= TSCONFIG_READ_RETRY_ATTEMPTS) break;

      logger?.warn("tsconfig-read-retry", `tsconfig parse failed retry=${attempt}`, {
        tsconfigPath: options.tsconfigPath,
        retry: attempt,
        maxRetries: TSCONFIG_READ_RETRY_ATTEMPTS - 1,
      });
      await wait(TSCONFIG_READ_RETRY_DELAY_MS);
    }
  }

  throw lastError;
}

async function syncTsconfigAliases(
  options: NormalizedSyncImportsOptions,
  sourceFiles: ScannedSourceFile[],
  logger: NormalizedCodeDisciplineLogger,
): Promise<SyncAliasesResult> {
  const result = await planTsconfigAliases(options, sourceFiles, logger);

  if (result.aliasesChanged) {
    await fs.writeFile(options.tsconfigPath, toStableJson(result.tsconfig));
    logger.success("aliases-written", `aliases written count=${result.aliasesCount}`, {
      tsconfigPath: options.tsconfigPath,
      aliasesCount: result.aliasesCount,
    });
  } else {
    logger.info("aliases-unchanged", `aliases unchanged count=${result.aliasesCount}`, {
      tsconfigPath: options.tsconfigPath,
      aliasesCount: result.aliasesCount,
    });
  }

  return result;
}

async function planTsconfigAliases(
  options: NormalizedSyncImportsOptions,
  sourceFiles: ScannedSourceFile[],
  logger?: NormalizedCodeDisciplineLogger,
): Promise<SyncAliasesResult> {
  const { config, originalConfig } = await readTsconfig(options, logger);
  const sourceFilesByPath = new Map(sourceFiles.map((file) => [file.absolutePath, file]));
  const compilerOptions = { ...(config.compilerOptions ?? {}) };
  const existingPaths = compilerOptions.paths ?? {};
  const existingState = await extractExistingPaths(options, sourceFilesByPath, existingPaths);
  const reservedIds = new Set<string>([
    ...Object.keys(existingState.passthroughPaths),
    ...Array.from(existingState.preservedAliasesByPath.values()),
  ]);
  const aliasRecords: AliasRecord[] = [];

  for (const file of sourceFiles) {
    const preservedAlias = existingState.preservedAliasesByPath.get(file.absolutePath);
    const aliasId = preservedAlias ?? generateAliasId(file, options, Array.from(reservedIds));
    reservedIds.add(aliasId);
    aliasRecords.push({
      id: aliasId,
      absolutePath: file.absolutePath,
      relativeFromProjectRoot: file.relativeFromProjectRoot,
    });
  }

  const managedPaths: Record<string, string[]> = {};
  for (const record of aliasRecords) {
    managedPaths[record.id] = [record.relativeFromProjectRoot];
  }

  const nextPaths = sortPathsRecord({
    ...existingState.passthroughPaths,
    ...managedPaths,
  });

  const nextCompilerOptions = {
    ...compilerOptions,
    paths: nextPaths,
  };

  delete nextCompilerOptions.baseUrl;

  const nextConfig: TsconfigJson = {
    ...config,
    compilerOptions: nextCompilerOptions,
  };

  const aliasesChanged = stableSerialize(originalConfig) !== stableSerialize(nextConfig);

  return {
    aliasesChanged,
    aliasesCount: aliasRecords.length,
    aliasRecords,
    tsconfig: nextConfig,
  };
}

export { planTsconfigAliases, readTsconfig, syncTsconfigAliases };
