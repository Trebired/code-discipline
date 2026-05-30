export {
  DEFAULT_ALIAS_PREFIX,
  DEFAULT_ALIAS_RANDOM_LENGTH,
  DEFAULT_ALIAS_STRATEGY,
  DEFAULT_ALLOW_RELATIVE,
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_FOLDERIZE_COMPOUND_FILE_SEPARATORS,
  DEFAULT_RULE_FIX,
  DEFAULT_RULE_STOP,
  DEFAULT_SOURCE_EXTENSIONS,
  DEFAULT_SOURCE_ROOT,
} from "./shared/constants.js";

export { checkCodeDiscipline, fixCodeDiscipline } from "./checks/index.js";
export { defineCodeDisciplineConfig, loadCodeDisciplineConfig } from "./config/index.js";
export { normalizeSyncImportsOptions } from "./config/normalize-sync-imports-options.js";
export { planTsconfigAliases, syncTsconfigAliases } from "./imports/aliases.js";
export { resolveRelativeImport } from "./imports/resolve.js";
export { rewriteSourceImports } from "./imports/rewrite.js";
export { scanSourceFiles } from "./imports/scan.js";
export { createRandomAlias, createRelativePathHashAlias, createRelativePathSlugAlias } from "./imports/strategies.js";
export { syncImports } from "./imports/sync-imports.js";
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
  LogAdapterFn,
  LoggingOptions,
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
  CheckCodeDisciplineOptions,
  CheckCodeDisciplineResult,
  CodeDisciplineConfig,
  CodeDisciplineRuleName,
  CodeDisciplineRules,
  CodeDisciplineViolation,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FolderizeCompoundFilesRuleOptions,
  MaxFileLinesRuleOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxFileLinesRule,
  NormalizedRuleControl,
  RuleControlOptions,
} from "./checks/types.js";
