import fs from "node:fs/promises";
import path from "node:path";

import type { CodeDisciplineRuntimeImportsSyncOptions } from "../checks/types.js";
import { InvalidCodeDisciplineConfigError } from "../shared/errors.js";
import { parseTsconfigJson, pathExists, stableSerialize, toPosixPath, toStableJson } from "../shared/utils.js";

type RuntimeImportsSyncResult = {
  changed: boolean;
  importsCount: number;
  packageJsonPath: string;
};

type PackageJsonWithImports = {
  imports?: Record<string, unknown>;
  [key: string]: unknown;
};

function resolvePackageJsonPath(projectRoot: string, packageJsonPath?: string): string {
  const input = packageJsonPath || "package.json";
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(projectRoot, input);
}

function normalizePackageImportTarget(target: string): string {
  const normalized = toPosixPath(target);
  if (normalized.startsWith("./") || normalized.startsWith("../") || normalized.startsWith("/")) {
    return normalized.startsWith("./") ? normalized : `./${normalized.replace(/^\/+/g, "")}`;
  }
  return `./${normalized.replace(/^\/+/g, "")}`;
}

function normalizeAliasPrefixes(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : ["#"];
  return values.map((entry) => String(entry || "").trim()).filter(Boolean);
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJsonWithImports> {
  if (!await pathExists(packageJsonPath)) {
    throw new InvalidCodeDisciplineConfigError("runtimeImportsSync package.json was not found", {
      filePath: packageJsonPath,
    });
  }

  const text = await fs.readFile(packageJsonPath, "utf8");
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidCodeDisciplineConfigError("runtimeImportsSync package.json must contain a JSON object", {
      filePath: packageJsonPath,
    });
  }

  return parsed as PackageJsonWithImports;
}

async function syncPackageJsonImportsFromTsconfigPaths(args: {
  projectRoot: string;
  options: CodeDisciplineRuntimeImportsSyncOptions | undefined;
}): Promise<RuntimeImportsSyncResult | null> {
  const options = args.options;
  if (!options?.enabled) return null;

  if ((options.source && options.source !== "tsconfig.paths") || (options.target && options.target !== "package.json.imports")) {
    throw new InvalidCodeDisciplineConfigError("runtimeImportsSync only supports source=tsconfig.paths and target=package.json.imports", {
      source: options.source,
      target: options.target,
    });
  }

  const tsconfigPath = path.isAbsolute(options.tsconfigPath || "")
    ? path.resolve(options.tsconfigPath!)
    : path.resolve(args.projectRoot, options.tsconfigPath || "tsconfig.json");
  if (!await pathExists(tsconfigPath)) {
    throw new InvalidCodeDisciplineConfigError("runtimeImportsSync tsconfig was not found", {
      filePath: tsconfigPath,
    });
  }

  const packageJsonPath = resolvePackageJsonPath(args.projectRoot, options.packageJsonPath);
  const tsconfigText = await fs.readFile(tsconfigPath, "utf8");
  const tsconfig = parseTsconfigJson(tsconfigText, tsconfigPath);
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
  );

  const nextPackageJson: PackageJsonWithImports = {
    ...packageJson,
    imports: nextImports,
  };

  const changed = stableSerialize(packageJson) !== stableSerialize(nextPackageJson);
  if (changed) {
    await fs.writeFile(packageJsonPath, toStableJson(nextPackageJson));
  }

  return {
    changed,
    importsCount: Object.keys(managedImports).length,
    packageJsonPath,
  };
}

export { syncPackageJsonImportsFromTsconfigPaths };
export type { RuntimeImportsSyncResult };
