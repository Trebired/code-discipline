import {
  DEFAULT_ALIAS_RANDOM_LENGTH,
  HASH_ALIAS_LENGTH,
} from "../shared/constants.js";
import { AliasCollisionError, InvalidAliasError } from "../shared/errors.js";
import type { AliasStrategyFn, AliasStrategyInput, NormalizedSyncImportsOptions, ScannedSourceFile } from "./types.js";
import { createHashToken, createRandomToken, createSlugToken, isAliasIdValid, stripKnownExtension } from "../shared/utils.js";

function buildStrategyInput(file: ScannedSourceFile, existingIds: string[], prefix: string, sourceExtensions: string[]): AliasStrategyInput {
  return {
    absolutePath: file.absolutePath,
    relativeFromProjectRoot: file.relativeFromProjectRoot,
    relativeFromSourceRoot: stripKnownExtension(file.relativeFromSourceRoot, sourceExtensions),
    existingIds: [...existingIds],
    prefix,
  };
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
  options: NormalizedSyncImportsOptions,
  existingIds: string[],
): string {
  const input = buildStrategyInput(file, existingIds, options.alias.prefix, options.sourceExtensions);
  const strategy = options.alias.strategy;
  const isCustomStrategy = typeof strategy === "function";

  if (strategy === "random") {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const aliasId = createRandomAlias(input, options.alias.randomLength);
      validateAliasId(aliasId, file);
      if (!existingIds.includes(aliasId)) return aliasId;
    }

    throw new AliasCollisionError(`${options.alias.prefix}<random>`, { filePath: file.absolutePath });
  }

  const aliasId = strategy === "relative-path-hash"
    ? createRelativePathHashAlias(input)
    : strategy === "relative-path-slug"
      ? createRelativePathSlugAlias(input)
      : (strategy as AliasStrategyFn)(input);

  validateAliasId(aliasId, file);

  if (existingIds.includes(aliasId)) {
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
