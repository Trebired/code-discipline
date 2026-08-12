import type { LoggingOptions } from "#uljkt8i26p4t";
import type { CodeDisciplineViolation } from "#bsmch74up4fm";

type SourceScanBackend = "native" | "ts";

type SourceScanStartedEvent = {
  phase: "scan-started";
  backend: SourceScanBackend;
  projectRoot: string;
  sourceRoot: string;
  sourceExtensionCount: number;
  excludePatternCount: number;
  concurrency: number;
};

type SourceScanStageEvent = {
  phase: "scan-stage";
  backend: SourceScanBackend;
  stage: string;
  elapsedMs: number;
  fileCount?: number;
};

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

type SourceRuleStartedEvent = {
  phase: "rule-started";
  rule: string;
  stage: string;
  totalItems: number;
  elapsedMs: number;
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

type SourceScanProgressEvent = SourceScanStartedEvent | SourceScanStageEvent | SourceScanChunkEvent | SourceScanCompletedEvent;
type SourceProgressEvent = SourceScanProgressEvent | SourceRuleStartedEvent | SourceRuleProgressEvent | SourceRuleCompletedEvent;
type SourceScanObserver = (event: SourceScanProgressEvent) => void;
type SourceProgressObserver = (event: SourceProgressEvent) => void;

type PackageJsonImportsSyncOptions = {
  enabled?: boolean;
  aliasPrefix?: string | string[];
  packageJsonPath?: string;
};

type ImportsOutputOptions =
| {
  type?: "project-manifests";
}
| {
  type: "alias-map";
  maxEntriesPerFile?: number;
};

type NormalizedImportsOutput =
| {
  type: "project-manifests";
}
| {
  type: "alias-map";
  dir: string;
  generatedTsconfigPath: string;
  maxEntriesPerFile: number;
};

type ImportsRuntimeNormalizeMode = "relative-dot-prefix" | "strip-dot-prefix" | "none";

type ImportsRuntimeOptions = {
  tsconfigPath?: string;
  normalize?: ImportsRuntimeNormalizeMode;
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

type ImportsOptions = {
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
  output?: ImportsOutputOptions;
  runtime?: ImportsRuntimeOptions;
  removeDeadImports?: boolean;
  logging?: LoggingOptions;
  progressObserver?: SourceProgressObserver;
};

type ImportsRuleOptions = Omit<ImportsOptions, "projectRoot">;

type ImportsResult = {
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

type NormalizedImportsOptions = SourceScanOptions& {
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
  output: NormalizedImportsOutput;
  removeDeadImports: boolean;
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
    maxEntriesExceeded?: Array<{filePath:string;count:number;max:number}>;
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
  NormalizedImportsOptions,
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
  SourceScanStageEvent,
  SourceScanStartedEvent,
  SourceProgressEvent,
  SourceProgressObserver,
  SourceRuleCompletedEvent,
  SourceRuleProgressEvent,
  SourceRuleStartedEvent,
  NormalizedImportsOutput,
  PackageJsonImportsSyncOptions,
  SyncAliasesResult,
  ImportsOptions,
  ImportsOutputOptions,
  ImportsResult,
  ImportsRuleOptions,
  ImportsRuntimeNormalizeMode,
  ImportsRuntimeOptions,
  TsconfigJson,
};
