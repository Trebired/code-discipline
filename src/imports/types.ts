import type { LoggingOptions } from "../shared/logging-types.js";
import type { CodeDisciplineViolation } from "../shared/discipline-types.js";

type SourceScanBackend = "native" | "ts";

type SourceScanChunkEvent = {
  phase: "chunk";
  backend: SourceScanBackend;
  chunkIndex: number;
  chunkSize: number;
  chunkMatchedFiles: number;
  queuedDirectories: number;
  completedDirectories: number;
  discoveredFiles: number;
  elapsedMs: number;
  concurrency: number;
};

type SourceScanCompletedEvent = {
  phase: "completed";
  backend: SourceScanBackend;
  chunkCount: number;
  directoryCount: number;
  fileCount: number;
  elapsedMs: number;
  concurrency: number;
};

type SourceScanProgressEvent = SourceScanChunkEvent | SourceScanCompletedEvent;
type SourceScanObserver = (event: SourceScanProgressEvent) => void;

type PackageJsonImportsSyncOptions = {
  enabled?: boolean;
  aliasPrefix?: string | string[];
  packageJsonPath?: string;
};

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

type ExcludeDirsOptions = {
  dirs?: string[];
  gitignore?: boolean;
};

type SyncImportsOptions = {
  projectRoot: string;
  configPath?: string;
  sourceRoot?: string;
  tsconfigPath?: string;
  sourceExtensions?: string[];
  includeDefaultSourceExtensions?: boolean;
  excludeDirs?: ExcludeDirsOptions;
  gitignorePath?: string;
  fix?: boolean;
  alias?: {
    prefix?: string;
    strategy?: "random" | "relative-path-hash" | "relative-path-slug" | AliasStrategyFn;
    randomLength?: number;
  };
  allowRelative?: string[] | AllowRelativeFn;
  packageJsonImports?: PackageJsonImportsSyncOptions;
  logging?: LoggingOptions;
};

type SyncImportsRuleOptions = Omit<SyncImportsOptions, "projectRoot">;

type SyncImportsResult = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
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
  excludeGitignoreDirs: boolean;
  gitignorePath: string;
  scanObserver?: SourceScanObserver;
};

type NormalizedSyncImportsOptions = SourceScanOptions & {
  sourceRootRelative: string;
  configPath?: string;
  tsconfigPath: string;
  fix: boolean;
  alias: {
    prefix: string;
    strategy: "random" | "relative-path-hash" | "relative-path-slug" | AliasStrategyFn;
    randomLength: number;
  };
  allowRelative: string[] | AllowRelativeFn;
  packageJsonImports?: PackageJsonImportsSyncOptions;
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
  ExcludeDirsOptions,
  NormalizedSyncImportsOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
  SourceScanBackend,
  SourceScanChunkEvent,
  SourceScanCompletedEvent,
  SourceScanObserver,
  SourceScanOptions,
  SourceScanProgressEvent,
  PackageJsonImportsSyncOptions,
  SyncAliasesResult,
  SyncImportsOptions,
  SyncImportsResult,
  SyncImportsRuleOptions,
  TsconfigJson,
};
