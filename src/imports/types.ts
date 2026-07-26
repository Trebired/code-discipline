import type { LoggingOptions } from "#uljkt8i26p4t";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";

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

type SourceRuleProgressEvent = {
  phase: "rule-chunk";
  rule: string;
  stage: string;
  chunkIndex: number;
  completedItems: number;
  totalItems: number;
  elapsedMs: number;
  discoveredFunctions?: number;
  duplicateGroups?: number;
  comparedCandidates?: number;
  deletedFiles?: number;
  violationCount?: number;
  movedFiles?: number;
  removedComments?: number;
  rewrittenFiles?: number;
  rewrittenImports?: number;
};

type SourceRuleCompletedEvent = {
  phase: "rule-completed";
  rule: string;
  stage: string;
  totalItems: number;
  elapsedMs: number;
  discoveredFunctions?: number;
  duplicateGroups?: number;
  comparedCandidates?: number;
  deletedFiles?: number;
  violationCount?: number;
  movedFiles?: number;
  removedComments?: number;
  rewrittenFiles?: number;
  rewrittenImports?: number;
};

type SourceScanProgressEvent = SourceScanChunkEvent | SourceScanCompletedEvent;
type SourceProgressEvent = SourceScanProgressEvent | SourceRuleProgressEvent | SourceRuleCompletedEvent;
type SourceScanObserver = (event: SourceScanProgressEvent) => void;
type SourceProgressObserver = (event: SourceProgressEvent) => void;

type PackageJsonImportsSyncOptions = {
  enabled?: boolean;
  aliasPrefix?: string | string[];
  packageJsonPath?: string;
};

type SyncImportsOutputOptions =
  | {
    type?: "project-manifests";
  }
  | {
    type: "alias-map";
    maxEntriesPerFile?: number;
  };

type NormalizedSyncImportsOutput =
  | {
    type: "project-manifests";
  }
  | {
    type: "alias-map";
    dir: string;
    generatedTsconfigPath: string;
    maxEntriesPerFile: number;
  };

type SyncImportsRuntimeNormalizeMode = "relative-dot-prefix" | "strip-dot-prefix" | "none";

type SyncImportsRuntimeOptions = {
  tsconfigPath?: string;
  normalize?: SyncImportsRuntimeNormalizeMode;
  restoreAfterRun?: boolean;
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

type ExcludeDirEntryType = "file" | "folder";

type ExcludeDirEntry = {
  type: ExcludeDirEntryType;
  pattern: string;
};

type ExcludeDirsOptions = {
  entries?: ExcludeDirEntry[];
  gitignore?: boolean;
};

type CodeDisciplineIgnoreOptions = {
  entries?: ExcludeDirEntry[];
  use_gitignore?: boolean;
};

type NormalizedCodeDisciplineIgnore = {
  entries: ExcludeDirEntry[];
  use_gitignore: boolean;
  gitignorePatterns: string[];
};

type SyncImportsOptions = {
  projectRoot: string;
  configPath?: string;
  excludeSourceExtensions?: string[];
  ignore?: CodeDisciplineIgnoreOptions;
  gitignorePath?: string;
  fix?: boolean;
  alias?: {
    prefix?: string;
    strategy?: "random" | "relative-path-hash" | "relative-path-slug" | AliasStrategyFn;
    randomLength?: number;
  };
  allowRelative?: string[] | AllowRelativeFn;
  output?: SyncImportsOutputOptions;
  runtime?: SyncImportsRuntimeOptions;
  logging?: LoggingOptions;
  progressObserver?: SourceProgressObserver;
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
  excludeDirs: ExcludeDirEntry[];
  excludeGitignoreDirs: boolean;
  gitignorePath: string;
  ignore?: NormalizedCodeDisciplineIgnore;
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
  output: NormalizedSyncImportsOutput;
  packageJsonImports: PackageJsonImportsSyncOptions;
  logging: LoggingOptions;
  progressObserver?: SourceProgressObserver;
};

type ScannedSourceFile = {
  absolutePath: string;
  relativeFromProjectRoot: string;
  relativeFromSourceRoot: string;
  extension: string;
};

type TsconfigJson = {
  extends?: string | string[];
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
  aliasPathMap?: Record<string, string>;
  drift?: {
    generatedTsconfigChanged?: boolean;
    importsFolderChanged?: boolean;
    inlineTsconfigPaths?: boolean;
    aliasMapStateChanged?: boolean;
    maxEntriesExceeded?: Array<{ filePath: string; count: number; max: number }>;
    rootExtendsChanged?: boolean;
  };
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
  CodeDisciplineIgnoreOptions,
  ExcludeDirEntry,
  ExcludeDirEntryType,
  ExcludeDirsOptions,
  NormalizedSyncImportsOptions,
  NormalizedCodeDisciplineIgnore,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
  SourceScanBackend,
  SourceScanChunkEvent,
  SourceScanCompletedEvent,
  SourceScanObserver,
  SourceScanOptions,
  SourceScanProgressEvent,
  SourceProgressEvent,
  SourceProgressObserver,
  SourceRuleCompletedEvent,
  SourceRuleProgressEvent,
  NormalizedSyncImportsOutput,
  PackageJsonImportsSyncOptions,
  SyncAliasesResult,
  SyncImportsOptions,
  SyncImportsOutputOptions,
  SyncImportsResult,
  SyncImportsRuleOptions,
  SyncImportsRuntimeNormalizeMode,
  SyncImportsRuntimeOptions,
  TsconfigJson,
};
