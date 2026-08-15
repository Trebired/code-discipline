import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import type { NormalizedCheckCodeDisciplineOptions } from "./types.js";

function resolveConfiguredSeverity(
  violation: CodeDisciplineViolation,
  options: NormalizedCheckCodeDisciplineOptions,
): "warning" | "fail" {
  switch (violation.rule) {
    case "banned-patterns": return options.rules.bannedPatterns?.severity ?? "fail";
    case "banned-files": return options.rules.bannedFiles?.severity ?? "fail";
    case "min-file-lines": return options.rules.minFileLines?.severity ?? "fail";
    case "min-declaration-name": return options.rules.minDeclarationName?.severity ?? "fail";
    case "max-declaration-name": return options.rules.maxDeclarationName?.severity ?? "fail";
    case "max-file-lines": return options.rules.maxFileLines?.severity ?? "fail";
    case "max-characters-per-line": return options.rules.maxCharactersPerLine?.severity ?? "fail";
    case "max-function-lines": return options.rules.maxFunctionLines?.severity ?? "fail";
    case "redundant-path-segments": return options.rules.redundantPathSegments?.severity ?? "fail";
    case "remove-empty-folders": return options.rules.removeEmptyFolders?.severity ?? "fail";
    case "imports": return options.rules.imports?.severity ?? "fail";
    case "remove-comments": return options.rules.removeComments?.severity ?? "fail";
    case "structural-blank-lines": return options.rules.structuralBlankLines?.severity ?? "fail";
    case "dry": return options.rules.dry?.severity ?? "fail";
    case "format": return options.rules.formatting?.severity ?? "fail";
  }
}

function applyConfiguredSeverity(
  violations: CodeDisciplineViolation[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  return violations.map((violation) => {
      const severity = violation.severity ?? resolveConfiguredSeverity(violation, options);
      return {
        ...violation,
        severity: severity === "warning" ? "warning" : undefined,
      };
  });
}

export { applyConfiguredSeverity };
