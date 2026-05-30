import type { LoggingOptions } from "../shared/logging-types.js";

type AliasStrategyInput = {
  absolutePath: string;
  relativeFromProjectRoot: string;
  relativeFromSourceRoot: string;
  existingIds: string[];
  prefix: string;
};

type AliasStrategyFn = (input: AliasStrategyInput) => string;

type AllowRelativeContext = {
  sourceFile: string;
  resolvedFile: string;
  projectRoot: string;
  sourceRoot: string;
};

type AllowRelativeFn = (specifier: string, context: AllowRelativeContext) => boolean;

type SyncImportsOptions = {
  projectRoot: string;
  sourceRoot?: string;
  tsconfigPath?: string;
  sourceExtensions?: string[];
  excludeDirs?: string[];
  enabled?: boolean;
  stop?: boolean;
  fix?: boolean;
  alias?: {
    prefix?: string;
    strategy?: "random" | "relative-path-hash" | "relative-path-slug" | AliasStrategyFn;
    randomLength?: number;
  };
  allowRelative?: string[] | AllowRelativeFn;
  logging?: LoggingOptions;
};

type SyncImportsRuleOptions = Omit<SyncImportsOptions, "projectRoot">;

type SyncImportsResult = {
  ok: boolean;
  mutations_allowed: boolean;
  aliases_changed: boolean;
  aliases_count: number;
  import_violations: number;
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
  enabled: boolean;
  stop: boolean;
  fix: boolean;
  alias: {
    prefix: string;
    strategy: "random" | "relative-path-hash" | "relative-path-slug" | AliasStrategyFn;
    randomLength: number;
  };
  allowRelative: string[] | AllowRelativeFn;
  logging: LoggingOptions;
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
  AllowRelativeContext,
  AllowRelativeFn,
  NormalizedSyncImportsOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
  SourceScanOptions,
  SyncAliasesResult,
  SyncImportsOptions,
  SyncImportsResult,
  SyncImportsRuleOptions,
  TsconfigJson,
};
