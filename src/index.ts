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
export { normalizeImportsOptions } from "./config/normalize/imports-options.js";
export { planTsconfigAliases, syncTsconfigAliases } from "./imports/aliases.js";
export { resolveRelativeImport } from "./imports/resolve.js";
export { rewriteSourceImports } from "./imports/rewrite.js";
export { scanSourceFiles } from "./imports/scan.js";
export { createRandomAlias, createRelativePathHashAlias, createRelativePathSlugAlias } from "./imports/strategies.js";
export { imports } from "./imports/imports.js";
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
  ImportsError,
  isImportsError,
} from "./shared/errors.js";

export type {
  CodeDisciplineCheckName,
  CodeDisciplineFormatterName,
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
  NormalizedImportsLogger,
  ImportsLogEvent,
  ImportsLogLevel,
} from "./shared/logging-types.js";

export type {
  AliasRecord,
  AliasStrategyFn,
  AliasStrategyInput,
  AllowRelativeContext,
  AllowRelativeFn,
  CodeDisciplineIgnoreOptions,
  NormalizedImportsOptions,
  NormalizedCodeDisciplineIgnore,
  PackageJsonImportsSyncOptions,
  RewriteFileResult,
  RewriteResult,
  ScannedSourceFile,
  SourceProgressEvent,
  SourceProgressObserver,
  SourceRuleCompletedEvent,
  SourceRuleProgressEvent,
  SourceScanOptions,
  SourceScanObserver,
  SourceScanProgressEvent,
  SyncAliasesResult,
  ImportsOptions,
  ImportsOutputOptions,
  ImportsResult,
  ImportsRuleOptions,
  ImportsRuntimeNormalizeMode,
  ImportsRuntimeOptions,
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
  BannedFileRuleEntry,
  BannedFilesRuleOptions,
  BannedPatternsRuleOptions,
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineLifecycleContext,
  CodeDisciplineLifecycleHookResult,
  CodeDisciplineLifecycleHooks,
  CodeDisciplineCheckSelectorSlug,
  CodeDisciplineFormatterSlug,
  CodeDisciplinePresets,
  CodeDisciplineRuleSlug,
  CodeDisciplineRuntimeMode as SharedCodeDisciplineRuntimeMode,
  CodeDisciplineRules,
  CodeDisciplineImportsRuleOptions,
  DryRuleOptions,
  FixableRuleSlug,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FixCodeDisciplineRuleResult,
  FolderizeCompoundFilesRuleOptions,
  MaxCharactersPerLineRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  MinDeclarationNameRuleOptions,
  MinFileLinesRuleOptions,
  NodeProcessBoundaryPresetOptions,
  NormalizedCodeFormatter,
  NormalizedBannedFileRuleEntry,
  NormalizedBannedFilesRule,
  NormalizedBannedPatternRuleEntry,
  NormalizedBannedPatternsRule,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedDryRule,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxCharactersPerLineRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  NormalizedMinDeclarationNameRule,
  NormalizedMinFileLinesRule,
  NormalizedRemoveCommentsRule,
  NormalizedStructuralBlankLinesRule,
  RemoveCommentsRuleOptions,
  StructuralBlankLinesRuleOptions,
  TsconfigPathsNormalizeMode,
} from "./checks/types.js";
