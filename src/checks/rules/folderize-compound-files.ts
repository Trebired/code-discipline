import path from "node:path";

import type { CodeDisciplineViolation, NormalizedCheckCodeDisciplineOptions } from "../types.js";
import type { ScannedSourceFile } from "../../imports/types.js";

function matchFolderizedFile(
  file: ScannedSourceFile,
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation | null {
  if (!options.rules.folderizeCompoundFiles.enabled) return null;

  const basename = path.basename(file.relativeFromSourceRoot, file.extension);

  for (const separator of options.rules.folderizeCompoundFiles.separators) {
    for (const suffix of options.rules.folderizeCompoundFiles.suffixes) {
      const token = `${separator}${suffix}`;
      if (!basename.endsWith(token)) continue;

      const stem = basename.slice(0, basename.length - token.length);
      if (!stem) continue;

      const suggestedPath = path.posix.join(
        path.posix.dirname(file.relativeFromProjectRoot),
        stem,
        `${suffix}${file.extension}`,
      );

      return {
        rule: "folderize-compound-files",
        severity: options.rules.folderizeCompoundFiles.severity,
        filePath: file.relativeFromProjectRoot,
        message: `file can be grouped under ${suggestedPath}`,
        suggestedPath,
        details: {
          separator,
          suffix,
          stem,
        },
      };
    }
  }

  return null;
}

function runFolderizeCompoundFilesRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation[] {
  return sourceFiles
    .map((file) => matchFolderizedFile(file, options))
    .filter(Boolean) as CodeDisciplineViolation[];
}

export { runFolderizeCompoundFilesRule };
