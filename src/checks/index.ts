import { normalizeCheckCodeDisciplineOptions } from "../config/normalize-check-options.js";
import { scanSourceFiles } from "../imports/scan.js";
import type { CheckCodeDisciplineOptions, CheckCodeDisciplineResult } from "./types.js";
import { runFolderizeCompoundFilesRule } from "./rules/folderize-compound-files.js";
import { runMaxFileLinesRule } from "./rules/max-file-lines.js";

async function checkCodeDiscipline(options: CheckCodeDisciplineOptions): Promise<CheckCodeDisciplineResult> {
  const normalized = await normalizeCheckCodeDisciplineOptions(options);
  const sourceFiles = await scanSourceFiles(normalized);
  const maxFileViolations = await runMaxFileLinesRule(sourceFiles, normalized);
  const folderizeViolations = runFolderizeCompoundFilesRule(sourceFiles, normalized);

  const violations = [...maxFileViolations, ...folderizeViolations]
    .sort((left, right) => left.filePath.localeCompare(right.filePath) || left.rule.localeCompare(right.rule));
  const warnings = violations.filter((violation) => violation.severity === "warn").length;
  const errors = violations.length - warnings;

  return {
    ok: errors === 0,
    warnings,
    errors,
    violations,
  };
}

export { checkCodeDiscipline };
