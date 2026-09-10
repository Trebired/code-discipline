import type { ExcludeDirEntry } from "#pkb9x3eo56l7";
import type { CodeDisciplineRuleSeverity } from "./types.js";

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
type NormalizedMaxDeclarationNameRule = {
  excludeDirs: ExcludeDirEntry[];
  max: number;
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
type NormalizedRedundantPathSegmentsRule = {
  excludeDirs: ExcludeDirEntry[];
  separators: string[];
  severity: CodeDisciplineRuleSeverity;
};
type NormalizedRemoveEmptyFoldersRule = {
  excludeDirs: ExcludeDirEntry[];
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
type NormalizedFormattingRule = NormalizedCodeFormatter& {
  excludeDirs: ExcludeDirEntry[];
  severity: CodeDisciplineRuleSeverity;
};

export type {
  NormalizedBannedFileRuleEntry,
  NormalizedBannedFilesRule,
  NormalizedBannedPatternRuleEntry,
  NormalizedBannedPatternsRule,
  NormalizedCodeFormatter,
  NormalizedDryRule,
  NormalizedFormattingRule,
  NormalizedMaxCharactersPerLineRule,
  NormalizedMaxDeclarationNameRule,
  NormalizedMaxFileLinesRule,
  NormalizedMaxFunctionLinesRule,
  NormalizedMinDeclarationNameRule,
  NormalizedMinFileLinesRule,
  NormalizedRedundantPathSegmentsRule,
  NormalizedRemoveCommentsRule,
  NormalizedRemoveEmptyFoldersRule,
  NormalizedStructuralBlankLinesRule,
};
