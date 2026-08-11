import path from "node:path";

import {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_REMOVE_DEAD_IMPORTS,
  DEFAULT_RULE_FIX,
} from "#ik5y0pee4ah1";
import { InvalidCodeDisciplineConfigError, InvalidTsconfigPathError } from "#4f8hale01wb4";
import type { NormalizedImportsOptions, ImportsOptions } from "#pkb9x3eo56l7";
import { isDirectory } from "#ntve5i5a0mol";
import { normalizeLoggingOptions } from "./logging-options.js";
import { normalizeSourceOptions } from "./source-options.js";

const GENERATED_TSCONFIG_PATH = ".trebired/code-discipline/generated/tsconfig.paths.json";
const IMPORTS_FOLDER_DIR = ".trebired/code-discipline/imports";

function assertValidImportsOptions(options: ImportsOptions): void {
  if ("imports"in(options as Record<string, unknown>)) {
    throw new InvalidCodeDisciplineConfigError("imports.imports is no longer supported; use allowRelative instead", {
        key: "imports",
    });
  }

  const removedKeys = [
    "enabled",
    "stop",
    "rewrite",
    "keepRelative",
    "sourceRoot",
    "tsconfigPath",
    "importsFolder",
    "generatedTsconfig",
    "packageJsonImports",
  ] as const;
  for (const key of removedKeys) {
    if (key in(options as Record<string, unknown>)) {
      throw new InvalidCodeDisciplineConfigError(`imports.${key} is no longer supported`, {
          key,
      });
    }
  }

  if ("severity"in(options as Record<string, unknown>)) {
    throw new InvalidCodeDisciplineConfigError("imports.severity is no longer supported", {
        key: "severity",
    });
  }

  for (const key of ["excludeFiles", "excludeFolders"] as const) {
    if (key in(options as Record<string, unknown>)) {
      throw new InvalidCodeDisciplineConfigError(`${key} is no longer supported; use ignore.entries with type "file" or "folder"`, {
          key,
      });
    }
  }

  if ("excludeDirs"in(options as Record<string, unknown>)) {
    throw new InvalidCodeDisciplineConfigError("excludeDirs is no longer supported; use ignore", {
        key: "excludeDirs",
    });
  }
}

function normalizeOutput(output: ImportsOptions["output"]): NormalizedImportsOptions["output"] {
  if (output === undefined) return { type: "project-manifests" };

  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new InvalidCodeDisciplineConfigError("imports.output must be an object when provided", {
        key: "output",
        value: output,
    });
  }

  const type = (output as { type?: unknown }).type;
  if (type === undefined || type === "project-manifests") {
    return { type: "project-manifests" };
  }

  if (type === "alias-map") {
    return {
      type: "alias-map",
      dir: IMPORTS_FOLDER_DIR,
      generatedTsconfigPath: GENERATED_TSCONFIG_PATH,
      maxEntriesPerFile: Math.max(1, Math.floor((output as { maxEntriesPerFile?: number }).maxEntriesPerFile ?? 1000)),
    };
  }

  throw new InvalidCodeDisciplineConfigError('imports.output.type must be "project-manifests" or "alias-map"', {
      key: "output.type",
      value: type,
  });
}

async function normalizeImportsOptions(options: ImportsOptions): Promise<NormalizedImportsOptions> {
  assertValidImportsOptions(options);

  const source = await normalizeSourceOptions(options);
  const tsconfigInput = options.runtime?.tsconfigPath ?? path.join(source.projectRoot, "tsconfig.json");
  const tsconfigPath = path.isAbsolute(tsconfigInput) ? path.resolve(tsconfigInput) : path.resolve(source.projectRoot, tsconfigInput);
  if (!await isDirectory(path.dirname(tsconfigPath))) {
    throw new InvalidTsconfigPathError(tsconfigPath);
  }

  const output = normalizeOutput(options.output);

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
    output,
    removeDeadImports: options.removeDeadImports ?? DEFAULT_REMOVE_DEAD_IMPORTS,
    packageJsonImports: {
      enabled: output.type === "project-manifests",
      aliasPrefix: DEFAULT_ALIAS_PREFIX,
      packageJsonPath: "package.json",
    },
    logging: normalizeLoggingOptions(options.logging, "logging"),
    progressObserver: options.progressObserver,
  };
}

export { normalizeImportsOptions };
