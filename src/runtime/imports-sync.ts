import fs from "node:fs/promises";
import path from "node:path";

import type { PackageJsonImportsSyncOptions } from "#pkb9x3eo56l7";
import { InvalidCodeDisciplineConfigError } from "#4f8hale01wb4";
import {
  parseTsconfigJson,
  normalizeDotPrefixedTarget,
  pathExists,
  stableSerialize,
  toStableJson,
} from "#ntve5i5a0mol";

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

type PackageJsonImportsContext = {
  aliasPrefixes: string[];
  compilerPaths: Record<string, unknown>;
  packageJson: PackageJsonWithImports;
  packageJsonPath: string;
};

function resolvePackageJsonPath(
  projectRoot: string,
  configPath: string | undefined,
  packageJsonPath?: string,
): string {
  void configPath;
  const input = packageJsonPath || "package.json";
  if (path.isAbsolute(input)) return path.resolve(input);
  return path.resolve(projectRoot, input);
}

function normalizeAliasPrefixes(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : ["#"];
  return values.map((entry) => String(entry || "").trim()).filter(Boolean);
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJsonWithImports> {
  if (!await pathExists(packageJsonPath)) {
    return {};
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

async function readPackageJsonImportsContext(args: {
    configPath?: string;
    options: PackageJsonImportsSyncOptions;
    projectRoot: string;
    tsconfigPath: string;
}): Promise<PackageJsonImportsContext> {
  if (!await pathExists(args.tsconfigPath)) {
    throw new InvalidCodeDisciplineConfigError("packageJsonImports tsconfig was not found", {
        filePath: args.tsconfigPath,
    });
  }

  const packageJsonPath = resolvePackageJsonPath(args.projectRoot, args.configPath, args.options.packageJsonPath);
  const tsconfigText = await fs.readFile(args.tsconfigPath, "utf8");
  const tsconfig = parseTsconfigJson(tsconfigText, args.tsconfigPath);

  return {
    aliasPrefixes: normalizeAliasPrefixes(args.options.aliasPrefix),
    compilerPaths: tsconfig.compilerOptions?.paths || {},
    packageJson: await readPackageJson(packageJsonPath),
    packageJsonPath,
  };
}

function buildPackageJsonImports(context: PackageJsonImportsContext): {
  managedImports: Record<string, string>;
  nextImports: Record<string, string>;
} {
  const shouldManageAlias = (aliasId: string) => context.aliasPrefixes.some((prefix) => aliasId.startsWith(prefix));
  const managedAliasIds = new Set(Object.keys(context.compilerPaths).filter((aliasId) => shouldManageAlias(aliasId)));
  const existingImports = context.packageJson.imports
  &&typeof context.packageJson.imports === "object"
  &&!Array.isArray(context.packageJson.imports)
  ? context.packageJson.imports
  : {};
  const preservedImports = Object.fromEntries(
    Object.entries(existingImports).filter(([aliasId]) => !managedAliasIds.has(aliasId)),
  );
  const managedImports = Object.fromEntries(
    Object.entries(context.compilerPaths)
    .filter(([aliasId, targets]) => shouldManageAlias(aliasId) && Array.isArray(targets) && targets.length > 0)
    .map(([aliasId, targets]) => [aliasId, normalizeDotPrefixedTarget(String(targets[0]))]),
  );

  return {
    managedImports,
    nextImports: Object.fromEntries(
      Object.entries({ ...preservedImports, ...managedImports })
      .sort(([left], [right]) => left.localeCompare(right)),
    ) as Record<string, string>,
  };
}

function isRelativePackageJsonImportTarget(target: unknown): target is string {
  if (typeof target !== "string") return false;
  const normalized = target.trim();
  return normalized.startsWith("./") || normalized.startsWith("../");
}

async function collectPackageJsonAliasImports(args: {
    configPath?: string;
    options: PackageJsonImportsSyncOptions | undefined;
    projectRoot: string;
}): Promise<Record<string, string>> {
  const packageJsonPath = resolvePackageJsonPath(args.projectRoot, args.configPath, args.options?.packageJsonPath);
  if (!await pathExists(packageJsonPath)) return {};

  const packageJson = await readPackageJson(packageJsonPath);
  const imports = packageJson.imports
  &&typeof packageJson.imports === "object"
  &&!Array.isArray(packageJson.imports)
  ? packageJson.imports
  : {};
  const aliasPrefixes = normalizeAliasPrefixes(args.options?.aliasPrefix);
  const entries = Object.entries(imports)
  .filter(([aliasId, target]) => aliasPrefixes.some((prefix) => aliasId.startsWith(prefix)) && isRelativePackageJsonImportTarget(target))
  .sort(([left], [right]) => left.localeCompare(right));

  return Object.fromEntries(entries) as Record<string, string>;
}

function buildPackageJsonImportsFromAliasMap(args: {
    aliasPathMap: Record<string, string>;
    aliasPrefixes: string[];
    packageJson: PackageJsonWithImports;
    writeManagedImports: boolean;
}): {
  managedImports: Record<string, string>;
  nextImports: Record<string, string>;
} {
  const shouldManageAlias = (aliasId: string) => args.aliasPrefixes.some((prefix) => aliasId.startsWith(prefix));
  const existingImports = args.packageJson.imports
  &&typeof args.packageJson.imports === "object"
  &&!Array.isArray(args.packageJson.imports)
  ? args.packageJson.imports
  : {};
  const preservedImports = Object.fromEntries(
    Object.entries(existingImports).filter(([aliasId, target]) => {
        if (!shouldManageAlias(aliasId)) return true;
        if (aliasId in args.aliasPathMap) return false;
        return !isRelativePackageJsonImportTarget(target);
    }),
  );
  const managedImports = args.writeManagedImports
  ? Object.fromEntries(
    Object.entries(args.aliasPathMap)
    .filter(([aliasId]) => shouldManageAlias(aliasId))
    .map(([aliasId, target]) => [aliasId, normalizeDotPrefixedTarget(target)]),
  ) as Record<string, string>
  : {};

  return {
    managedImports,
    nextImports: Object.fromEntries(
      Object.entries({ ...preservedImports, ...managedImports })
      .sort(([left], [right]) => left.localeCompare(right)),
    ) as Record<string, string>,
  };
}

async function collectPackageJsonImportsSyncState(args: {
    configPath?: string;
    options: PackageJsonImportsSyncOptions | undefined;
    projectRoot: string;
    tsconfigPath: string;
}): Promise<RuntimeImportsSyncResult|null> {
  const options = args.options;
  if (!options?.enabled) return null;

  const context = await readPackageJsonImportsContext({ ...args, options });
  const { managedImports, nextImports } = buildPackageJsonImports(context);
  const nextPackageJson: PackageJsonWithImports = { ...context.packageJson };

  if (Object.keys(nextImports).length > 0) {
    nextPackageJson.imports = nextImports;
  } else {
    delete nextPackageJson.imports;
  }

  return {
    changed: stableSerialize(context.packageJson) !== stableSerialize(nextPackageJson),
    importsCount: Object.keys(managedImports).length,
    nextImports,
    packageJsonPath: context.packageJsonPath,
  };
}

async function collectPackageJsonImportsSyncStateFromAliasMap(args: {
    aliasPathMap: Record<string, string>;
    cleanWhenDisabled?: boolean;
    configPath?: string;
    options: PackageJsonImportsSyncOptions | undefined;
    projectRoot: string;
}): Promise<RuntimeImportsSyncResult|null> {
  const enabled = args.options?.enabled === true;
  if (!enabled && !args.cleanWhenDisabled) return null;

  const packageJsonPath = resolvePackageJsonPath(args.projectRoot, args.configPath, args.options?.packageJsonPath);
  if (!await pathExists(packageJsonPath)) {
    if (!enabled) return null;
    throw new InvalidCodeDisciplineConfigError("packageJsonImports package.json was not found", {
        filePath: packageJsonPath,
    });
  }

  const packageJson = await readPackageJson(packageJsonPath);
  const aliasPrefixes = normalizeAliasPrefixes(args.options?.aliasPrefix);
  const { managedImports, nextImports } = buildPackageJsonImportsFromAliasMap({
      aliasPathMap: args.aliasPathMap,
      aliasPrefixes,
      packageJson,
      writeManagedImports: enabled,
  });
  const nextPackageJson: PackageJsonWithImports = { ...packageJson };

  if (Object.keys(nextImports).length > 0) {
    nextPackageJson.imports = nextImports;
  } else {
    delete nextPackageJson.imports;
  }

  return {
    changed: stableSerialize(packageJson) !== stableSerialize(nextPackageJson),
    importsCount: enabled ? Object.keys(managedImports).length : 0,
    nextImports,
    packageJsonPath,
  };
}

async function syncPackageJsonImportsFromTsconfigPaths(args: {
    configPath?: string;
    options: PackageJsonImportsSyncOptions | undefined;
    projectRoot: string;
    tsconfigPath: string;
}): Promise<RuntimeImportsSyncResult|null> {
  const state = await collectPackageJsonImportsSyncState(args);
  if (!state || !state.changed) return state;

  const packageJson = await readPackageJson(state.packageJsonPath);
  const nextPackageJson: PackageJsonWithImports = { ...packageJson };

  if (Object.keys(state.nextImports).length > 0) {
    nextPackageJson.imports = state.nextImports;
  } else {
    delete nextPackageJson.imports;
  }

  await fs.writeFile(state.packageJsonPath, toStableJson(nextPackageJson));
  return state;
}

async function syncPackageJsonImportsFromAliasMap(args: {
    aliasPathMap: Record<string, string>;
    cleanWhenDisabled?: boolean;
    configPath?: string;
    options: PackageJsonImportsSyncOptions | undefined;
    projectRoot: string;
}): Promise<RuntimeImportsSyncResult|null> {
  const state = await collectPackageJsonImportsSyncStateFromAliasMap(args);
  if (!state || !state.changed) return state;

  const packageJson = await readPackageJson(state.packageJsonPath);
  const nextPackageJson: PackageJsonWithImports = {
    ...packageJson,
  };

  if (Object.keys(state.nextImports).length > 0) {
    nextPackageJson.imports = state.nextImports;
  } else {
    delete nextPackageJson.imports;
  }

  await fs.writeFile(state.packageJsonPath, toStableJson(nextPackageJson));
  return state;
}

export {
  collectPackageJsonAliasImports,
  collectPackageJsonImportsSyncState,
  collectPackageJsonImportsSyncStateFromAliasMap,
  syncPackageJsonImportsFromAliasMap,
  syncPackageJsonImportsFromTsconfigPaths,
};
export type { RuntimeImportsSyncResult };
