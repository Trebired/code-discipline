import type { LogAdapterFn } from "../shared/logging-types.js";

type AliasStrategyInput = {
  absolutePath: string;
  relativeFromProjectRoot: string;
  relativeFromSourceRoot: string;
  existingIds: string[];
  prefix: string;
};

type AliasStrategyFn = (input: AliasStrategyInput) => string;

type KeepRelativeContext = {
  sourceFile: string;
  resolvedFile: string;
  projectRoot: string;
  sourceRoot: string;
};

type KeepRelativeFn = (specifier: string, context: KeepRelativeContext) => boolean;

type SyncImportsOptions = {
  projectRoot: string;
  sourceRoot?: string;
  tsconfigPath?: string;
  sourceExtensions?: string[];
  excludeDirs?: string[];
  alias?: {
    prefix?: string;
    strategy?: "random" | "relative-path-hash" | "relative-path-slug" | AliasStrategyFn;
    randomLength?: number;
  };
  imports?: {
    rewrite?: boolean;
    keepRelative?: string[] | KeepRelativeFn;
  };
  logging?: {
    enabled?: boolean;
    logger?: unknown;
    adapter?: "trebired" | "generic" | "console" | LogAdapterFn;
    quiet?: boolean;
  };
};

type SyncImportsResult = {
  aliases_changed: boolean;
  aliases_count: number;
  rewritten_files: number;
  rewritten_imports: number;
};

type SourceScanOptions = {
  projectRoot: string;
  sourceRoot: string;
  sourceExtensions: string[];
  excludeDirs: string[];
};

type NormalizedSyncImportsOptions = SourceScanOptions & {
  sourceRootRelative: string;
  tsconfigPath: string;
  alias: {
    prefix: string;
    strategy: "random" | "relative-path-hash" | "relative-path-slug" | AliasStrategyFn;
    randomLength: number;
  };
  imports: {
    rewrite: boolean;
    keepRelative: string[] | KeepRelativeFn;
  };
  logging: {
    enabled: boolean;
    logger?: unknown;
    adapter?: "trebired" | "generic" | "console" | LogAdapterFn;
    quiet: boolean;
  };
};

type ScannedSourceFile = {
  absolutePath: string;
  relativeFromProjectRoot: string;
  relativeFromSourceRoot: string;
  extension: string;
};

type TsconfigJson = {
  compilerOptions?: {
    paths?: Record<string, string[]>;
    baseUrl?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type AliasRecord = {
  id: string;
  absolutePath: string;
  relativeFromProjectRoot: string;
};

type SyncAliasesResult = {
  aliasesChanged: boolean;
  aliasesCount: number;
  aliasRecords: AliasRecord[];
  tsconfig: TsconfigJson;
};

type RewriteFileResult = {
  rewritten: boolean;
  rewrittenImports: number;
};

type RewriteResult = {
  rewrittenFiles: number;
  rewrittenImports: number;
};

export type {
  AliasRecord,
  AliasStrategyFn,
  AliasStrategyInput,
  KeepRelativeContext,
  KeepRelativeFn,
  NormalizedSyncImportsOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
  SourceScanOptions,
  SyncAliasesResult,
  SyncImportsOptions,
  SyncImportsResult,
  TsconfigJson,
};
