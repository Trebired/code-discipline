import path from "node:path";

import {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_RULE_FIX,
} from "../../shared/constants.js";
import { InvalidCodeDisciplineConfigError, InvalidTsconfigPathError } from "../../shared/errors.js";
import type { NormalizedSyncImportsOptions, SyncImportsOptions } from "../../imports/types.js";
import { isDirectory } from "../../shared/utils.js";
import { normalizeLoggingOptions } from "./logging-options.js";
import { normalizeSourceOptions } from "./source-options.js";

function assertValidSyncImportsOptions(options: SyncImportsOptions): void {
  if ("imports" in (options as Record<string, unknown>)) {
    throw new InvalidCodeDisciplineConfigError("syncImports.imports is no longer supported; use allowRelative instead", {
      key: "imports",
    });
  }

  for (const key of ["enabled", "stop", "rewrite", "keepRelative"] as const) {
    if (key in (options as Record<string, unknown>)) {
      throw new InvalidCodeDisciplineConfigError(`syncImports.${key} is no longer supported`, {
        key,
      });
    }
  }

  if ("severity" in (options as Record<string, unknown>)) {
    throw new InvalidCodeDisciplineConfigError("syncImports.severity is no longer supported", {
      key: "severity",
    });
  }

  for (const key of ["excludeFiles", "excludeFolders"] as const) {
    if (key in (options as Record<string, unknown>)) {
      throw new InvalidCodeDisciplineConfigError(`${key} is no longer supported; use excludeDirs.entries with type "file" or "folder"`, {
        key,
      });
    }
  }
}

async function normalizeSyncImportsOptions(options: SyncImportsOptions): Promise<NormalizedSyncImportsOptions> {
  assertValidSyncImportsOptions(options);

  const source = await normalizeSourceOptions(options);
  const tsconfigInput = options.tsconfigPath ?? path.join(source.projectRoot, "tsconfig.json");
  const tsconfigPath = path.isAbsolute(tsconfigInput) ? path.resolve(tsconfigInput) : path.resolve(source.projectRoot, tsconfigInput);
  if (!await isDirectory(path.dirname(tsconfigPath))) {
    throw new InvalidTsconfigPathError(tsconfigPath);
  }

  const importsFolderEnabled = options.importsFolder?.enabled ?? false;

  return {
    ...source,
    configPath: options.configPath,
    tsconfigPath,
    fix: options.fix ?? DEFAULT_RULE_FIX,
    alias: {
      prefix: options.alias?.prefix ?? DEFAULT_ALIAS_PREFIX,
      strategy: options.alias?.strategy ?? DEFAULT_ALIAS_STRATEGY,
      randomLength: Math.max(1, Math.floor(options.alias?.randomLength ?? DEFAULT_ALIAS_RANDOM_LENGTH)),
    },
    allowRelative: options.allowRelative ?? DEFAULT_ALLOW_RELATIVE,
    importsFolder: {
      enabled: importsFolderEnabled,
      dir: options.importsFolder?.dir ?? "imports",
      maxEntriesPerFile: Math.max(1, Math.floor(options.importsFolder?.maxEntriesPerFile ?? 1000)),
    },
    generatedTsconfig: {
      enabled: options.generatedTsconfig?.enabled ?? importsFolderEnabled,
      path: options.generatedTsconfig?.path ?? ".code-discipline/generated/tsconfig.paths.json",
    },
    packageJsonImports: options.packageJsonImports,
    logging: normalizeLoggingOptions(options.logging, "logging"),
    progressObserver: options.progressObserver,
  };
}

export { normalizeSyncImportsOptions };
