import path from "node:path";

import {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_IMPORTS_REWRITE,
  DEFAULT_KEEP_RELATIVE,
} from "../shared/constants.js";
import { InvalidTsconfigPathError } from "../shared/errors.js";
import type { NormalizedSyncImportsOptions, SyncImportsOptions } from "../imports/types.js";
import { isDirectory } from "../shared/utils.js";
import { normalizeSourceOptions } from "./normalize-source-options.js";

async function normalizeSyncImportsOptions(options: SyncImportsOptions): Promise<NormalizedSyncImportsOptions> {
  const source = await normalizeSourceOptions(options);
  const tsconfigInput = options.tsconfigPath ?? path.join(source.projectRoot, "tsconfig.json");
  const tsconfigPath = path.isAbsolute(tsconfigInput) ? path.resolve(tsconfigInput) : path.resolve(source.projectRoot, tsconfigInput);
  if (!await isDirectory(path.dirname(tsconfigPath))) {
    throw new InvalidTsconfigPathError(tsconfigPath);
  }

  return {
    ...source,
    tsconfigPath,
    alias: {
      prefix: options.alias?.prefix ?? DEFAULT_ALIAS_PREFIX,
      strategy: options.alias?.strategy ?? DEFAULT_ALIAS_STRATEGY,
      randomLength: Math.max(1, Math.floor(options.alias?.randomLength ?? DEFAULT_ALIAS_RANDOM_LENGTH)),
    },
    imports: {
      rewrite: options.imports?.rewrite ?? DEFAULT_IMPORTS_REWRITE,
      keepRelative: options.imports?.keepRelative ?? DEFAULT_KEEP_RELATIVE,
    },
    logging: {
      enabled: options.logging?.enabled ?? Boolean(options.logging?.logger || options.logging?.adapter),
      logger: options.logging?.logger,
      adapter: options.logging?.adapter,
      quiet: options.logging?.quiet ?? false,
    },
  };
}

export { normalizeSyncImportsOptions };
