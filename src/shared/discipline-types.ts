type CodeDisciplineSeverity = "error" | "warning";

type CodeDisciplineRuleName =
  | "max-file-lines"
  | "max-function-lines"
  | "folderize-compound-files"
  | "sync-imports"
  | "dry";

type CodeDisciplineViolation = {
  rule: CodeDisciplineRuleName;
  severity: CodeDisciplineSeverity;
  fix: boolean;
  filePath: string;
  message: string;
  details: Record<string, unknown>;
  suggestedPath?: string;
};

type CodeDisciplineResult = {
  ok: boolean;
  errors: number;
  warnings: number;
  violations: CodeDisciplineViolation[];
};

export type {
  CodeDisciplineResult,
  CodeDisciplineRuleName,
  CodeDisciplineSeverity,
  CodeDisciplineViolation,
};
