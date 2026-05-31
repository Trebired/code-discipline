import type { LoggingOptions } from "../shared/logging-types.js";
import type { SourceScanOptions, SyncImportsRuleOptions } from "../imports/types.js";
import type { CodeDisciplineResult, CodeDisciplineSeverity } from "../shared/discipline-types.js";

type SeverityRuleOptions = {
  severity?: CodeDisciplineSeverity;
};

type MaxFileLinesRuleOptions = SeverityRuleOptions & {
  max?: number;
};

type FolderizeCompoundFilesRuleOptions = SeverityRuleOptions & {
  fix?: boolean;
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

type NormalizedMaxFileLinesRule = {
  severity: CodeDisciplineSeverity;
  max: number;
};

type NormalizedFolderizeCompoundFilesRule = {
  severity: CodeDisciplineSeverity;
  fix: boolean;
  separators: string[];
};

type NormalizedCheckCodeDisciplineOptions = SourceScanOptions & {
  sourceRootRelative: string;
  logging: LoggingOptions;
  rules: {
    maxFileLines?: NormalizedMaxFileLinesRule;
    folderizeCompoundFiles?: NormalizedFolderizeCompoundFilesRule;
    syncImports?: SyncImportsRuleOptions;
  };
};

type CheckCodeDisciplineResult = CodeDisciplineResult;

type FixCodeDisciplineResult = CodeDisciplineResult & {
  moved_files: number;
  rewritten_files: number;
  rewritten_imports: number;
};

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
};
