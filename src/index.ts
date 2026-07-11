export {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
  DEFAULT_RULE_FIX,
  DEFAULT_SOURCE_EXTENSIONS,
  DEFAULT_SOURCE_ROOT,
} from "./shared/constants.js";

export { checkCodeDiscipline, fixCodeDiscipline } from "./checks/index.js";
export {
  DEFAULT_CONFIG_FILENAMES,
  defineCodeDisciplineConfig,
  findCodeDisciplineConfigModule,
  loadResolvedCodeDisciplineConfig,
} from "./config/index.js";
export { normalizeSyncImportsOptions } from "./config/normalize/sync-imports-options.js";
export { planTsconfigAliases, syncTsconfigAliases } from "./imports/aliases.js";
export { resolveRelativeImport } from "./imports/resolve.js";
export { rewriteSourceImports } from "./imports/rewrite.js";
export { scanSourceFiles } from "./imports/scan.js";
export { createRandomAlias, createRelativePathHashAlias, createRelativePathSlugAlias } from "./imports/strategies.js";
export { syncImports } from "./imports/sync-imports.js";
export { syncPackageJsonImportsFromTsconfigPaths } from "./runtime/imports-sync.js";
export { prepareTsconfigPaths, restoreTsconfigPaths } from "./runtime/tsconfig-paths.js";
export { codeDiscipline, createCodeDiscipline } from "./run.js";
export { resolveLogger } from "./shared/logging.js";
export {
  activeNativeBackendNotice,
  nativeAddonCandidatePathsForCurrentPlatform,
  nativeBinaryBasenameForCurrentPlatform,
  resetNativeBindingForTests,
} from "./native/native.js";

export {
  AliasCollisionError,
  FileConflictError,
  FixFailureError,
  InvalidCodeDisciplineConfigError,
  InvalidAliasError,
  InvalidProjectRootError,
  InvalidSourceRootError,
  InvalidTsconfigPathError,
  ParseFailureError,
  RewriteFailureError,
  SyncImportsError,
  isSyncImportsError,
} from "./shared/errors.js";

export type {
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineViolation,
} from "./shared/discipline-types.js";

export type {
  CodeDisciplineLogAdapterFn,
  CodeDisciplineLogEvent,
  CodeDisciplineLogLevel,
  LogAdapterFn,
  LoggingOptions,
  NormalizedCodeDisciplineLogger,
  NormalizedSyncImportsLogger,
  SyncImportsLogEvent,
  SyncImportsLogLevel,
} from "./shared/logging-types.js";

export type {
  AliasRecord,
  AliasStrategyFn,
  AliasStrategyInput,
  AllowRelativeContext,
  AllowRelativeFn,
  NormalizedSyncImportsOptions,
  PackageJsonImportsSyncOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
  SourceScanOptions,
  SyncAliasesResult,
  SyncImportsOptions,
  SyncImportsResult,
  SyncImportsRuleOptions,
  TsconfigJson,
} from "./imports/types.js";

export type {
  CheckCodeDisciplineCommandOptions,
  CodeDisciplineInvocationOptions,
  CodeDisciplineMode,
  CodeDisciplineOptions,
  CodeDisciplineResult as RunCodeDisciplineResult,
  CodeDisciplineRuntimeMode,
  CodeDisciplineRunInvocationOptions,
  CreatedCodeDiscipline,
  CheckCodeDisciplineInvocationOptions,
  FixCodeDisciplineInvocationOptions,
  FixCodeDisciplineCommandOptions,
} from "./run.js";

export type {
  BannedPatternRuleEntry,
  BannedPatternsRuleOptions,
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineLifecycleContext,
  CodeDisciplineLifecycleHookResult,
  CodeDisciplineLifecycleHooks,
  CodeDisciplinePackageJsonImportsOptions,
  CodeDisciplineRuleSlug,
  CodeDisciplineRuntimeMode as SharedCodeDisciplineRuntimeMode,
  CodeDisciplineRules,
  CodeDisciplineSyncImportsRuleOptions,
  CodeDisciplineTsconfigPathsOptions,
  DryHelperReference,
  DryRuleOptions,
  EvasionGuardsOptions,
  FixableRuleSlug,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FixCodeDisciplineRuleResult,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  NormalizedBannedPatternRuleEntry,
  NormalizedBannedPatternsRule,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedDryRule,
  NormalizedEvasionGuardsOptions,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  NormalizedPackedCodeGuardOptions,
  NormalizedRemoveCommentsRule,
  PackedCodeGuardOptions,
  RemoveCommentsRuleOptions,
  TsconfigPathsNormalizeMode,
} from "./checks/types.js";
