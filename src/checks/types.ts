import type { LoggingOptions } from "#uljkt8i26p4t";
import { CodeDisciplineIgnoreOptions, ExcludeDirEntry, SourceProgressObserver, SourceScanObserver, SourceScanOptions, ImportsRuleOptions, ImportsRuntimeNormalizeMode } from "#pkb9x3eo56l7";
import type {
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineViolation,
} from "#bsmch74up4fm";
type CodeDisciplineRuleSlug = CodeDisciplineRuleName;
type CodeDisciplineCheckSelectorSlug = CodeDisciplineRuleSlug;
type FixableRuleSlug = "banned-files" | "min-file-lines" | "max-characters-per-line" | "folderize-compound-files" | "imports" | "remove-comments" | "structural-blank-lines" | "format";
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
type NodeProcessBoundaryPresetOptions = {
  envBoundaryFiles?: string[];
  processBoundaryFiles?: string[];
};
type CodeDisciplinePresets = {
  nodeProcessBoundary?: NodeProcessBoundaryPresetOptions;
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
type StructuralBlankLinesRuleOptions = RuleExclusionOptions & {
  severity?: CodeDisciplineRuleSeverity;
};
type DryRuleOptions = RuleExclusionOptions & {
  minDuplicateCharacters?: number;
  severity?: CodeDisciplineRuleSeverity;
};
type CodeDisciplineImportsRuleOptions = RuleExclusionOptions & Omit<ImportsRuleOptions, "fix" | "excludeDirs"> & {
  severity?: CodeDisciplineRuleSeverity;
};
type FormattingRuleOptions = RuleExclusionOptions & {
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
  imports?: CodeDisciplineImportsRuleOptions;
  removeComments?: RemoveCommentsRuleOptions;
  structuralBlankLines?: StructuralBlankLinesRuleOptions;
  formatting?: FormattingRuleOptions;
  dry?: DryRuleOptions;
};
type TsconfigPathsNormalizeMode = ImportsRuntimeNormalizeMode;
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
  excludeSourceExtensions?: string[];
  ignore?: CodeDisciplineIgnoreOptions;
  gitignorePath?: string;
  logging?: LoggingOptions;
  presets?: CodeDisciplinePresets;
  rules?: CodeDisciplineRules;
  lifecycle?: CodeDisciplineLifecycleHooks;
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
type NormalizedStructuralBlankLinesRule = {
  excludeDirs: ExcludeDirEntry[];
  severity: CodeDisciplineRuleSeverity;
};
type NormalizedCodeFormatter = {
  targets: string[];
  ignore: boolean;
  maxCharactersPerLine: number;
  indentWidth?: number;
  finalNewline: boolean;
  trimTrailingWhitespace: boolean;
  collapseBlankLines: boolean;
};
type NormalizedFormattingRule = NormalizedCodeFormatter & {
  excludeDirs: ExcludeDirEntry[];
  severity: CodeDisciplineRuleSeverity;
};
type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  configPath?: string;
  sourceRootRelative: string;
  logging: LoggingOptions;
  onlyRules?: CodeDisciplineCheckSelectorSlug[] | FixableRuleSlug[];
  progressObserver?: SourceProgressObserver;
  rules: {
    bannedFiles?: NormalizedBannedFilesRule;
    bannedPatterns?: NormalizedBannedPatternsRule;
    minFileLines?: NormalizedMinFileLinesRule;
    minDeclarationName?: NormalizedMinDeclarationNameRule;
    maxFileLines?: NormalizedMaxFileLinesRule;
    maxCharactersPerLine?: NormalizedMaxCharactersPerLineRule;
    maxFunctionLines?: NormalizedMaxFunctionLinesRule;
    folderizeCompoundFiles?: NormalizedFolderizeCompoundFilesRule;
    imports?: CodeDisciplineImportsRuleOptions;
    removeComments?: NormalizedRemoveCommentsRule;
    structuralBlankLines?: NormalizedStructuralBlankLinesRule;
    formatting?: NormalizedFormattingRule;
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
  inserted_blank_lines?: number;
  removed_blank_lines?: number;
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
  CodeDisciplinePresets,
  CodeDisciplineRuleSlug,
  CodeDisciplineRuleSeverity,
  CodeDisciplineRuntimeMode,
  CodeDisciplineCheckSelectorSlug,
  CodeDisciplineRules,
  CodeDisciplineImportsRuleOptions,
  DryRuleOptions,
  FixableRuleSlug,
  FixCodeDisciplineOptions,
  FixCodeDisciplineResult,
  FixCodeDisciplineRuleResult,
  FolderizeCompoundFilesRuleOptions,
  FormattingRuleOptions,
  MaxCharactersPerLineRuleOptions,
  MaxFileLinesRuleOptions,
  MaxFunctionLinesRuleOptions,
  MinDeclarationNameRuleOptions,
  MinFileLinesRuleOptions,
  NormalizedCodeFormatter,
  NormalizedFormattingRule,
  NormalizedBannedFileRuleEntry,
  NormalizedBannedFilesRule,
  NormalizedBannedPatternRuleEntry,
  NormalizedBannedPatternsRule,
  RemoveCommentsRuleOptions,
  RuleExclusionOptions,
  NormalizedCheckCodeDisciplineOptions,
  NormalizedDryRule,
  NormalizedFolderizeCompoundFilesRule,
  NormalizedMaxCharactersPerLineRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  NormalizedMinDeclarationNameRule,
  NormalizedMinFileLinesRule,
  NormalizedRemoveCommentsRule,
  NodeProcessBoundaryPresetOptions,
  NormalizedStructuralBlankLinesRule,
  StructuralBlankLinesRuleOptions,
  TsconfigPathsNormalizeMode,
};
