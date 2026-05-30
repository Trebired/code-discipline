import path from "node:path";

import {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_RULE_FIX,
  DEFAULT_RULE_STOP,
} from "../shared/constants.js";
import { InvalidCodeDisciplineConfigError, InvalidTsconfigPathError } from "../shared/errors.js";
import type { NormalizedSyncImportsOptions, SyncImportsOptions } from "../imports/types.js";
import { isDirectory } from "../shared/utils.js";
import { normalizeSourceOptions } from "./normalize-source-options.js";

async function normalizeSyncImportsOptions(options: SyncImportsOptions): Promise<NormalizedSyncImportsOptions> {
  if ("imports" in (options as Record<string, unknown>)) {
    throw new InvalidCodeDisciplineConfigError("syncImports.imports is no longer supported; use allowRelative instead", {
      key: "imports",
    });
  }

  for (const key of ["rewrite", "keepRelative", "severity"] as const) {
    if (key in (options as Record<string, unknown>)) {
      throw new InvalidCodeDisciplineConfigError(`syncImports.${key} is no longer supported`, {
        key,
      });
    }
  }

  const source = await normalizeSourceOptions(options);
  const tsconfigInput = options.tsconfigPath ?? path.join(source.projectRoot, "tsconfig.json");
  const tsconfigPath = path.isAbsolute(tsconfigInput) ? path.resolve(tsconfigInput) : path.resolve(source.projectRoot, tsconfigInput);
  if (!await isDirectory(path.dirname(tsconfigPath))) {
    throw new InvalidTsconfigPathError(tsconfigPath);
  }

  return {
    ...source,
    tsconfigPath,
    enabled: options.enabled ?? true,
    stop: options.stop ?? DEFAULT_RULE_STOP,
    fix: options.fix ?? DEFAULT_RULE_FIX,
    alias: {
      prefix: options.alias?.prefix ?? DEFAULT_ALIAS_PREFIX,
      strategy: options.alias?.strategy ?? DEFAULT_ALIAS_STRATEGY,
      randomLength: Math.max(1, Math.floor(options.alias?.randomLength ?? DEFAULT_ALIAS_RANDOM_LENGTH)),
    },
    allowRelative: options.allowRelative ?? DEFAULT_ALLOW_RELATIVE,
    logging: {
      enabled: options.logging?.enabled ?? Boolean(options.logging?.logger || options.logging?.adapter),
      logger: options.logging?.logger,
      adapter: options.logging?.adapter,
      quiet: options.logging?.quiet ?? false,
    },
  };
}

export { normalizeSyncImportsOptions };
