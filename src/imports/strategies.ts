import {
  DEFAULT_ALIAS_RANDOM_LENGTH,
  HASH_ALIAS_LENGTH,
} from "#ik5y0pee4ah1";
import { AliasCollisionError, InvalidAliasError } from "#4f8hale01wb4";
import type { AliasStrategyFn, AliasStrategyInput, NormalizedImportsOptions, ScannedSourceFile } from "./types.js";
import { createHashToken, createRandomToken, createSlugToken, isAliasIdValid, stripKnownExtension } from "#ntve5i5a0mol";

type ExistingAliasIds = ReadonlySet<string>|readonly string[];

function buildStrategyInput(file: ScannedSourceFile, existingIds: string[], prefix: string, sourceExtensions: string[]): AliasStrategyInput {
  return {
    absolutePath: file.absolutePath,
    relativeFromProjectRoot: file.relativeFromProjectRoot,
    relativeFromSourceRoot: stripKnownExtension(file.relativeFromSourceRoot, sourceExtensions),
    existingIds: [...existingIds],
    prefix,
  };
}

function existingAliasIdsSet(existingIds: ExistingAliasIds): ReadonlySet<string> {
  return existingIds instanceof Set ? existingIds : new Set(existingIds);
}

function createRandomAlias(input: AliasStrategyInput, length = DEFAULT_ALIAS_RANDOM_LENGTH): string {
  return `${input.prefix}${createRandomToken(length)}`;
}

function createRelativePathHashAlias(input: AliasStrategyInput): string {
  return `${input.prefix}${createHashToken(input.relativeFromSourceRoot, HASH_ALIAS_LENGTH)}`;
}

function createRelativePathSlugAlias(input: AliasStrategyInput): string {
  return `${input.prefix}${createSlugToken(input.relativeFromSourceRoot)}`;
}

function validateAliasId(aliasId: unknown, file: ScannedSourceFile) {
  if (!isAliasIdValid(aliasId)) {
    throw new InvalidAliasError(aliasId, { filePath: file.absolutePath });
  }
}

function generateAliasId(
  file: ScannedSourceFile,
  options: NormalizedImportsOptions,
  existingIds: ExistingAliasIds,
): string {
  const strategy = options.alias.strategy;
  const isCustomStrategy = typeof strategy === "function";
  const existingSet = existingAliasIdsSet(existingIds);

  if (strategy === "random") {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const aliasId = createRandomAlias(
        buildStrategyInput(file, [], options.alias.prefix, options.sourceExtensions),
        options.alias.randomLength,
      );
      validateAliasId(aliasId, file);
      if (!existingSet.has(aliasId)) return aliasId;
    }

    throw new AliasCollisionError(`${options.alias.prefix}<random>`, { filePath: file.absolutePath });
  }

  const input = buildStrategyInput(
    file,
    isCustomStrategy ? Array.from(existingSet) : [],
    options.alias.prefix,
    options.sourceExtensions,
  );
  const aliasId = strategy === "relative-path-hash"
  ? createRelativePathHashAlias(input)
  : strategy === "relative-path-slug"
  ? createRelativePathSlugAlias(input)
  : (strategy as AliasStrategyFn)(input);

  validateAliasId(aliasId, file);

  if (existingSet.has(aliasId)) {
    throw new AliasCollisionError(aliasId, {
        filePath: file.absolutePath,
        strategy: isCustomStrategy ? "custom" : strategy,
    });
  }

  return aliasId;
}

export {
  createRandomAlias,
  createRelativePathHashAlias,
  createRelativePathSlugAlias,
  generateAliasId,
};
