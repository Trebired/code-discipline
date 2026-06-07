import fs from "node:fs/promises";
import path from "node:path";

import type { CodeDisciplineTsconfigPathsOptions } from "../checks/types.js";
import { InvalidTsconfigPathError } from "../shared/errors.js";
import { parseTsconfigJson, pathExists, stableSerialize, toPosixPath, toStableJson } from "../shared/utils.js";
import type { TsconfigJson } from "../imports/types.js";

type PreparedTsconfigPathsResult = {
  changed: boolean;
  restoreAfterRun: boolean;
  restoreOnExit: boolean;
  originalText?: string;
  tsconfigPath: string;
};

type RuntimeTsconfigPathsState = {
  changed: boolean;
  restored: boolean;
  restoreAfterRun: boolean;
  restoreOnExit: boolean;
  tsconfigPath: string;
};

function resolveTsconfigPath(projectRoot: string, tsconfigPath?: string): string {
  const input = tsconfigPath || "tsconfig.json";
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(projectRoot, input);
}

function normalizePathsValue(value: string, mode: NonNullable<CodeDisciplineTsconfigPathsOptions["normalize"]>): string {
  if (mode === "none") return value;
  if (path.isAbsolute(value)) return toPosixPath(value);

  const normalized = toPosixPath(value);
  if (mode === "relative-dot-prefix") {
    if (normalized.startsWith("./") || normalized.startsWith("../") || normalized.startsWith("/")) {
      return normalized;
    }
    return `./${normalized.replace(/^\/+/g, "")}`;
  }

  if (mode === "strip-dot-prefix") {
    return normalized.startsWith("./") ? normalized.slice(2) : normalized;
  }

  return normalized;
}

function rewriteCompilerPaths(
  config: TsconfigJson,
  mode: NonNullable<CodeDisciplineTsconfigPathsOptions["normalize"]>,
): TsconfigJson {
  const compilerOptions = { ...(config.compilerOptions || {}) };
  const existingPaths = compilerOptions.paths;

  if (!existingPaths || typeof existingPaths !== "object") {
    return {
      ...config,
      compilerOptions,
    };
  }

  const nextPaths = Object.fromEntries(
    Object.entries(existingPaths).map(([aliasId, targets]) => [
      aliasId,
      Array.isArray(targets)
        ? targets.map((target) => normalizePathsValue(String(target), mode))
        : targets,
    ]),
  );

  return {
    ...config,
    compilerOptions: {
      ...compilerOptions,
      paths: nextPaths,
    },
  };
}

async function prepareTsconfigPaths(
  projectRoot: string,
  options: CodeDisciplineTsconfigPathsOptions | undefined,
  mode: "check" | "fix",
): Promise<PreparedTsconfigPathsResult | null> {
  const normalize = options?.normalize || "none";
  if (normalize === "none") return null;

  const tsconfigPath = resolveTsconfigPath(projectRoot, options?.tsconfigPath);
  if (!await pathExists(tsconfigPath)) {
    throw new InvalidTsconfigPathError(tsconfigPath);
  }

  const originalText = await fs.readFile(tsconfigPath, "utf8");
  const originalConfig = parseTsconfigJson(originalText, tsconfigPath);
  const nextConfig = rewriteCompilerPaths(originalConfig, normalize);
  const changed = stableSerialize(originalConfig) !== stableSerialize(nextConfig);

  if (changed) {
    await fs.writeFile(tsconfigPath, toStableJson(nextConfig));
  }

  return {
    changed,
    originalText,
    restoreAfterRun: Boolean(options?.restoreAfterRun),
    restoreOnExit: Boolean(options?.restoreAfterRun),
    tsconfigPath,
  };
}

async function restoreTsconfigPaths(prepared: PreparedTsconfigPathsResult | null): Promise<RuntimeTsconfigPathsState | null> {
  if (!prepared) return null;

  let restored = false;
  if (prepared.restoreOnExit && prepared.originalText != null && prepared.changed) {
    await fs.writeFile(prepared.tsconfigPath, prepared.originalText);
    restored = true;
  }

  return {
    changed: prepared.changed,
    restored,
    restoreAfterRun: prepared.restoreAfterRun,
    restoreOnExit: prepared.restoreOnExit,
    tsconfigPath: prepared.tsconfigPath,
  };
}

export { prepareTsconfigPaths, resolveTsconfigPath, restoreTsconfigPaths };
export type { PreparedTsconfigPathsResult, RuntimeTsconfigPathsState };
