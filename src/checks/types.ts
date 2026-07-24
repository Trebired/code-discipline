import type { LoggingOptions } from "../shared/logging-types.js";
import type { Options as PrettierOptions } from "prettier";
import type {
  ExcludeDirEntry,
  ExcludeDirsOptions,
  PackageJsonImportsSyncOptions,
  SourceProgressObserver,
  SourceScanObserver,
  SourceScanOptions,
  SyncImportsRuleOptions,
} from "../imports/types.js";
import type {
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineViolation,
} from "../shared/discipline-types.js";

type CodeDisciplineRuleSlug = CodeDisciplineRuleName;
type CodeDisciplineFormatterSlug = "prettier";
type CodeDisciplineCheckSelectorSlug = CodeDisciplineRuleSlug | CodeDisciplineFormatterSlug;
type FixableRuleSlug = "banned-files" | "min-file-lines" | "folderize-compound-files" | "sync-imports" | "remove-comments" | CodeDisciplineFormatterSlug;
type CodeDisciplineMode = "check" | "fix";
type CodeDisciplineRuntimeMode = CodeDisciplineMode;
type CodeDisciplineRuleSeverity = "warning" | "fail";

type RuleExclusionOptions = {
  excludeDirs?: ExcludeDirEntry[];
};

type BannedPatternRuleEntry = string | {
  value: string;
  allowedFiles?: string[];
};

type BannedPatternsRuleOptions = RuleExclusionOptions & {
  patterns: BannedPatternRuleEntry[];
  severity?: CodeDisciplineRuleSeverity;
};

type BannedFileRuleEntry = string | {
  glob: string;
};

type BannedFilesRuleOptions = RuleExclusionOptions & {
  patterns: BannedFileRuleEntry[];
  severity?: CodeDisciplineRuleSeverity;
};

type MinFileLinesRuleOptions = RuleExclusionOptions & {
  min?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type MinDeclarationNameRuleOptions = RuleExclusionOptions & {
  min?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type MaxFileLinesRuleOptions = RuleExclusionOptions & {
  max?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type MaxCharactersPerLineRuleOptions = RuleExclusionOptions & {
  max?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type MaxFunctionLinesRuleOptions = RuleExclusionOptions & {
  max?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type FolderizeCompoundFilesRuleOptions = RuleExclusionOptions & {
  separators?: string[];
  severity?: CodeDisciplineRuleSeverity;
};

type RemoveCommentsRuleOptions = RuleExclusionOptions & {
  severity?: CodeDisciplineRuleSeverity;
  exclude?: string[];
};

type DryRuleOptions = RuleExclusionOptions & {
  minDuplicateCharacters?: number;
  severity?: CodeDisciplineRuleSeverity;
};

type CodeDisciplinePackageJsonImportsOptions = PackageJsonImportsSyncOptions;

type CodeDisciplineSyncImportsRuleOptions = RuleExclusionOptions & Omit<SyncImportsRuleOptions, "fix" | "excludeDirs"> & {
  packageJsonImports?: CodeDisciplinePackageJsonImportsOptions;
  severity?: CodeDisciplineRuleSeverity;
};

type CodeDisciplineRules = {
  bannedFiles?: BannedFilesRuleOptions;
  bannedPatterns?: BannedPatternsRuleOptions;
  minFileLines?: MinFileLinesRuleOptions;
  minDeclarationName?: MinDeclarationNameRuleOptions;
  maxFileLines?: MaxFileLinesRuleOptions;
  maxCharactersPerLine?: MaxCharactersPerLineRuleOptions;
  maxFunctionLines?: MaxFunctionLinesRuleOptions;
  folderizeCompoundFiles?: FolderizeCompoundFilesRuleOptions;
  syncImports?: CodeDisciplineSyncImportsRuleOptions;
  removeComments?: RemoveCommentsRuleOptions;
  dry?: DryRuleOptions;
};

type PrettierFormatterOptions = {
  targets?: string[];
  ignore?: string[];
  options?: PrettierOptions;
};

type CodeDisciplineFormatters = {
  prettier?: PrettierFormatterOptions;
};

type TsconfigPathsNormalizeMode = "relative-dot-prefix" | "strip-dot-prefix" | "none";

type CodeDisciplineTsconfigPathsOptions = {
  tsconfigPath?: string;
  normalize?: TsconfigPathsNormalizeMode;
  restoreAfterRun?: boolean;
};

type CodeDisciplineLifecycleContext = {
  mode: CodeDisciplineRuntimeMode;
  projectRoot: string;
  configPath?: string;
  config: CodeDisciplineConfig;
  state: Record<string, unknown>;
};

type CodeDisciplineLifecycleHookResult = void | Promise<void>;

type CodeDisciplineLifecycleHooks = {
  beforeRun?: (context: CodeDisciplineLifecycleContext) => CodeDisciplineLifecycleHookResult;
  afterRun?: (context: CodeDisciplineLifecycleContext, result: unknown) => CodeDisciplineLifecycleHookResult;
  beforeMode?: (context: CodeDisciplineLifecycleContext) => CodeDisciplineLifecycleHookResult;
  afterMode?: (context: CodeDisciplineLifecycleContext, result: unknown) => CodeDisciplineLifecycleHookResult;
};

type CheckCodeDisciplineOptions = {
  projectRoot: string;
  configPath?: string;
  sourceRoot?: string;
  excludeSourceExtensions?: string[];
  excludeDirs?: ExcludeDirsOptions;
  gitignorePath?: string;
  logging?: LoggingOptions;
  formatters?: CodeDisciplineFormatters;
  rules?: CodeDisciplineRules;
  lifecycle?: CodeDisciplineLifecycleHooks;
  tsconfigPaths?: CodeDisciplineTsconfigPathsOptions;
  onlyRules?: CodeDisciplineCheckSelectorSlug[];
  progressObserver?: SourceProgressObserver;
  scanObserver?: SourceScanObserver;
};

type FixCodeDisciplineOptions = Omit<CheckCodeDisciplineOptions, "onlyRules"> & {
  onlyRules?: FixableRuleSlug[];
};

type CodeDisciplineConfig = Omit<CheckCodeDisciplineOptions, "projectRoot">;

type NormalizedBannedPatternRuleEntry = {
  value: string;
  normalizedValue: string;
  allowedFiles: string[];
};

type NormalizedBannedPatternsRule = {
  excludeDirs: ExcludeDirEntry[];
  patterns: NormalizedBannedPatternRuleEntry[];
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedBannedFileRuleEntry = {
  glob: string;
};

type NormalizedBannedFilesRule = {
  excludeDirs: ExcludeDirEntry[];
  patterns: NormalizedBannedFileRuleEntry[];
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMinFileLinesRule = {
  excludeDirs: ExcludeDirEntry[];
  min: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMinDeclarationNameRule = {
  excludeDirs: ExcludeDirEntry[];
  min: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMaxFileLinesRule = {
  excludeDirs: ExcludeDirEntry[];
  max: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMaxCharactersPerLineRule = {
  excludeDirs: ExcludeDirEntry[];
  max: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedMaxFunctionLinesRule = {
  excludeDirs: ExcludeDirEntry[];
  max: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedFolderizeCompoundFilesRule = {
  excludeDirs: ExcludeDirEntry[];
  separators: string[];
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedDryRule = {
  excludeDirs: ExcludeDirEntry[];
  minDuplicateCharacters: number;
  severity: CodeDisciplineRuleSeverity;
};

type NormalizedRemoveCommentsRule = {
  excludeDirs: ExcludeDirEntry[];
  severity: CodeDisciplineRuleSeverity;
  exclude: string[];
};

type NormalizedPrettierFormatter = {
  targets: string[];
  ignore: string[];
  options: PrettierOptions;
};

type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  configPath?: string;
  sourceRootRelative: string;
  logging: LoggingOptions;
  onlyRules?: CodeDisciplineCheckSelectorSlug[] | FixableRuleSlug[];
  progressObserver?: SourceProgressObserver;
  formatters: {
    prettier?: NormalizedPrettierFormatter;
  };
  rules: {
    bannedFiles?: NormalizedBannedFilesRule;
    bannedPatterns?: NormalizedBannedPatternsRule;
    minFileLines?: NormalizedMinFileLinesRule;
    minDeclarationName?: NormalizedMinDeclarationNameRule;
    maxFileLines?: NormalizedMaxFileLinesRule;
    maxCharactersPerLine?: NormalizedMaxCharactersPerLineRule;
    maxFunctionLines?: NormalizedMaxFunctionLinesRule;
    folderizeCompoundFiles?: NormalizedFolderizeCompoundFilesRule;
    syncImports?: CodeDisciplineSyncImportsRuleOptions;
    removeComments?: NormalizedRemoveCommentsRule;
    dry?: NormalizedDryRule;
  };
};

type CheckCodeDisciplineResult = CodeDisciplineResult;

type FixCodeDisciplineRuleResult = {
  ok: boolean;
  violationCount: number;
  violations: CodeDisciplineViolation[];
  moved_files?: number;
  rewritten_files?: number;
  rewritten_imports?: number;
  removed_comments?: number;
  formatted_files?: number;
  unchanged_files?: number;
  removed_duplicates?: number;
  added_imports?: number;
  deleted_files?: number;
};

type FixCodeDisciplineResult = CodeDisciplineResult & {
  deleted_files: number;
  moved_files: number;
  rewritten_files: number;
  rewritten_imports: number;
  removed_comments: number;
  formatted_files: number;
  unchanged_files: number;
  ruleResults: Partial<Record<FixableRuleSlug, FixCodeDisciplineRuleResult>>;
};

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
  CodeDisciplineMode,
  CodeDisciplinePackageJsonImportsOptions,
  CodeDisciplineRuleSlug,
  CodeDisciplineRuleSeverity,
  CodeDisciplineRuntimeMode,
  CodeDisciplineCheckSelectorSlug,
  CodeDisciplineFormatterSlug,
  CodeDisciplineFormatters,
  CodeDisciplineRules,
  CodeDisciplineSyncImportsRuleOptions,
  CodeDisciplineTsconfigPathsOptions,
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
  NormalizedPrettierFormatter,
  NormalizedBannedFileRuleEntry,
  NormalizedBannedFilesRule,
  NormalizedBannedPatternRuleEntry,
  NormalizedBannedPatternsRule,
  RemoveCommentsRuleOptions,
  RuleExclusionOptions,
  PrettierFormatterOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedDryRule,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxCharactersPerLineRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  NormalizedMinDeclarationNameRule,
  NormalizedMinFileLinesRule,
  NormalizedRemoveCommentsRule,
  TsconfigPathsNormalizeMode,
};
