export {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
  DEFAULT_RULE_FIX,
  DEFAULT_RULE_SEVERITY,
  DEFAULT_SOURCE_EXTENSIONS,
  DEFAULT_SOURCE_ROOT,
} from "./shared/constants.js";

export { checkCodeDiscipline, fixCodeDiscipline } from "./checks/index.js";
export { defineCodeDisciplineConfig } from "./config/index.js";
export { normalizeSyncImportsOptions } from "./config/normalize-sync-imports-options.js";
export { planTsconfigAliases, syncTsconfigAliases } from "./imports/aliases.js";
export { resolveRelativeImport } from "./imports/resolve.js";
export { rewriteSourceImports } from "./imports/rewrite.js";
export { scanSourceFiles } from "./imports/scan.js";
export { createRandomAlias, createRelativePathHashAlias, createRelativePathSlugAlias } from "./imports/strategies.js";
export { syncImports } from "./imports/sync-imports.js";
export { codeDiscipline, createCodeDiscipline } from "./run.js";
export { resolveLogger } from "./shared/logging.js";

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
  CodeDisciplineSeverity,
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
  CreatedCodeDiscipline,
  FixCodeDisciplineCommandOptions,
  StartupCodeDisciplineCommandOptions,
  SyncCodeDisciplineCommandOptions,
} from "./run.js";

export type {
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineRules,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxFileLinesRule,
  SeverityRuleOptions,
} from "./checks/types.js";
