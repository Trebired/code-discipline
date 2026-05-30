import type { LoggingOptions } from "../shared/logging-types.js";
import type { SourceScanOptions, SyncImportsRuleOptions } from "../imports/types.js";

type RuleControlOptions = {
  enabled?: boolean;
  stop?: boolean;
  fix?: boolean;
};

type MaxFileLinesRuleOptions = RuleControlOptions & {
  max?: number;
};

type FolderizeCompoundFilesRuleOptions = RuleControlOptions & {
  separators?: string[];
};

type CodeDisciplineRules = {
  maxFileLines?: MaxFileLinesRuleOptions;
  folderizeCompoundFiles?: FolderizeCompoundFilesRuleOptions;
  syncImports?: SyncImportsRuleOptions;
};

type CheckCodeDisciplineOptions = {
  projectRoot: string;
  sourceRoot?: string;
  sourceExtensions?: string[];
  excludeDirs?: string[];
  logging?: LoggingOptions;
  rules?: CodeDisciplineRules;
};

type FixCodeDisciplineOptions = CheckCodeDisciplineOptions;

type CodeDisciplineConfig = Omit<CheckCodeDisciplineOptions, "projectRoot">;

type NormalizedRuleControl = {
  enabled: boolean;
  stop: boolean;
  fix: boolean;
};

type NormalizedMaxFileLinesRule = NormalizedRuleControl & {
  max: number;
};

type NormalizedFolderizeCompoundFilesRule = NormalizedRuleControl & {
  separators: string[];
};

type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  sourceRootRelative: string;
  logging: LoggingOptions;
  rules: {
    maxFileLines: NormalizedMaxFileLinesRule;
    folderizeCompoundFiles: NormalizedFolderizeCompoundFilesRule;
    syncImports: SyncImportsRuleOptions;
  };
};

type CodeDisciplineRuleName = "max-file-lines" | "folderize-compound-files" | "sync-imports";

type CodeDisciplineViolation = {
  rule: CodeDisciplineRuleName;
  stop: boolean;
  fix: boolean;
  filePath: string;
  message: string;
  details: Record<string, unknown>;
  suggestedPath?: string;
};

type CheckCodeDisciplineResult = {
  ok: boolean;
  warnings: number;
  failures: number;
  violations: CodeDisciplineViolation[];
};

type FixCodeDisciplineResult = {
  ok: boolean;
  moved_files: number;
  rewritten_files: number;
  rewritten_imports: number;
  warnings: number;
  failures: number;
  violations: CodeDisciplineViolation[];
};

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
};
