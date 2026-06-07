import fs from "node:fs/promises";
import path from "node:path";

import type { CodeDisciplinePackageJsonImportsOptions } from "../checks/types.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import {
  parseTsconfigJson,
  pathExists,
  stableSerialize,
  toPosixPath,
  toStableJson,
} from "../shared/utils.js";

type RuntimeImportsSyncResult = {
  changed: boolean;
  importsCount: number;
  nextImports: Record<string, string>;
  packageJsonPath: string;
};

type PackageJsonWithImports = {
  imports?: Record<string, unknown>;
  [key: string]: unknown;
};

function resolvePackageJsonPath(
  projectRoot: string,
  configPath: string | undefined,
  packageJsonPath?: string,
): string {
  const input = packageJsonPath || "package.json";
  if (path.isAbsolute(input)) return path.resolve(input);
  const baseDir = configPath ? path.dirname(configPath) : projectRoot;
  return path.resolve(baseDir, input);
}

function normalizePackageImportTarget(target: string): string {
  const normalized = toPosixPath(target).replace(/^\.\/+/, "");
  if (normalized.startsWith("../")) return normalized;
  return normalized.startsWith("./") ? normalized : `./${normalized.replace(/^\/+/g, "")}`;
}

function normalizeAliasPrefixes(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : ["#"];
  return values.map((entry) => String(entry || "").trim()).filter(Boolean);
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJsonWithImports> {
  if (!await pathExists(packageJsonPath)) {
    throw new InvalidCodeDisciplineConfigError("packageJsonImports package.json was not found", {
      filePath: packageJsonPath,
    });
  }

  const text = await fs.readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidCodeDisciplineConfigError("packageJsonImports package.json must contain a JSON object", {
      filePath: packageJsonPath,
    });
  }

  return parsed as PackageJsonWithImports;
}

async function collectPackageJsonImportsSyncState(args: {
  configPath?: string;
  options: CodeDisciplinePackageJsonImportsOptions | undefined;
  projectRoot: string;
  tsconfigPath: string;
}): Promise<RuntimeImportsSyncResult | null> {
  const options = args.options;
  if (!options?.enabled) return null;

  if (!await pathExists(args.tsconfigPath)) {
    throw new InvalidCodeDisciplineConfigError("packageJsonImports tsconfig was not found", {
      filePath: args.tsconfigPath,
    });
  }

  const packageJsonPath = resolvePackageJsonPath(args.projectRoot, args.configPath, options.packageJsonPath);
  const tsconfigText = await fs.readFile(args.tsconfigPath, "utf8");
  const tsconfig = parseTsconfigJson(tsconfigText, args.tsconfigPath);
  const packageJson = await readPackageJson(packageJsonPath);
  const compilerPaths = tsconfig.compilerOptions?.paths || {};
  const aliasPrefixes = normalizeAliasPrefixes(options.aliasPrefix);
  const shouldManageAlias = (aliasId: string) => aliasPrefixes.some((prefix) => aliasId.startsWith(prefix));
  const managedAliasIds = new Set(
    Object.keys(compilerPaths).filter((aliasId) => shouldManageAlias(aliasId)),
  );

  const existingImports = packageJson.imports && typeof packageJson.imports === "object" && !Array.isArray(packageJson.imports)
    ? packageJson.imports
    : {};
  const preservedImports = Object.fromEntries(
    Object.entries(existingImports).filter(([aliasId]) => !managedAliasIds.has(aliasId)),
  );

  const managedImports = Object.fromEntries(
    Object.entries(compilerPaths)
      .filter(([aliasId, targets]) => shouldManageAlias(aliasId) && Array.isArray(targets) && targets.length > 0)
      .map(([aliasId, targets]) => [aliasId, normalizePackageImportTarget(String(targets[0]))]),
  );

  const nextImports = Object.fromEntries(
    Object.entries({
      ...preservedImports,
      ...managedImports,
    }).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, string>;

  const nextPackageJson: PackageJsonWithImports = {
    ...packageJson,
    imports: nextImports,
  };

  return {
    changed: stableSerialize(packageJson) !== stableSerialize(nextPackageJson),
    importsCount: Object.keys(managedImports).length,
    nextImports,
    packageJsonPath,
  };
}

async function syncPackageJsonImportsFromTsconfigPaths(args: {
  configPath?: string;
  options: CodeDisciplinePackageJsonImportsOptions | undefined;
  projectRoot: string;
  tsconfigPath: string;
}): Promise<RuntimeImportsSyncResult | null> {
  const state = await collectPackageJsonImportsSyncState(args);
  if (!state || !state.changed) return state;

  const packageJson = await readPackageJson(state.packageJsonPath);
  const nextPackageJson: PackageJsonWithImports = {
    ...packageJson,
    imports: state.nextImports,
  };

  await fs.writeFile(state.packageJsonPath, toStableJson(nextPackageJson));
  return state;
}

export { collectPackageJsonImportsSyncState, syncPackageJsonImportsFromTsconfigPaths };
export type { RuntimeImportsSyncResult };
