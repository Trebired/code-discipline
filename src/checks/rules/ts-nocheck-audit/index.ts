import fs from "node:fs/promises";

import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { supportsTsNocheckAudit } from "../../../shared/languages.js";
import { createRuleProgress, emitRuleChunk, emitRuleCompleted } from "../../progress.js";
import type { FixCodeDisciplineRuleResult, NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import { buildStrippedProgram, getSemanticDiagnosticCount, resolveTsconfigPath } from "./program.js";
import { findLeadingTsNocheckLine, removeLeadingTsNocheckLine } from "./pragma.js";

type UnnecessaryPragmaFile = {
  file: ScannedSourceFile;
  strippedText: string;
};

async function findUnnecessaryPragmaFiles(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
  stage: "scan" | "fix",
): Promise<UnnecessaryPragmaFile[]> {
  const progress = createRuleProgress({
    observer: options.progressObserver,
    rule: "ts-nocheck-audit",
    stage,
    totalItems: sourceFiles.length,
  });

  const candidates: Array<{ file: ScannedSourceFile; text: string }> = [];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index]!;
    if (!supportsTsNocheckAudit(file.extension)) {
      emitRuleChunk(progress, index + 1, candidates.length);
      continue;
    }

    const text = await fs.readFile(file.absolutePath, "utf8");
    if (findLeadingTsNocheckLine(text)) {
      candidates.push({ file, text });
    }

    emitRuleChunk(progress, index + 1, candidates.length);
  }

  if (candidates.length === 0) {
    emitRuleCompleted(progress, 0);
    return [];
  }

  const tsconfigPath = resolveTsconfigPath(options.projectRoot, options.rules.tsNocheckAudit?.tsconfigPath);
  const program = await buildStrippedProgram({
    tsconfigPath,
    candidates: candidates.map(({ file, text }) => ({ absolutePath: file.absolutePath, text })),
  });

  const unnecessary: UnnecessaryPragmaFile[] = [];

  for (const candidate of candidates) {
    const diagnosticCount = getSemanticDiagnosticCount(program, candidate.file.absolutePath);
    if (diagnosticCount !== 0) continue;

    const { text: strippedText, removed } = removeLeadingTsNocheckLine(candidate.text);
    if (!removed) continue;

    unnecessary.push({ file: candidate.file, strippedText });
  }

  emitRuleCompleted(progress, unnecessary.length);
  return unnecessary;
}

function createTsNocheckAuditViolation(file: ScannedSourceFile): CodeDisciplineViolation {
  return {
    rule: "ts-nocheck-audit",
    fix: true,
    filePath: file.relativeFromProjectRoot,
    message: "@ts-nocheck is unnecessary — no diagnostics are reported without it",
    details: {
      diagnosticCount: 0,
    },
  };
}

async function collectTsNocheckAuditViolations(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<CodeDisciplineViolation[]> {
  const unnecessary = await findUnnecessaryPragmaFiles(sourceFiles, options, "scan");
  return unnecessary.map(({ file }) => createTsNocheckAuditViolation(file));
}

async function fixTsNocheckAuditRule(
  sourceFiles: ScannedSourceFile[],
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<FixCodeDisciplineRuleResult> {
  const unnecessary = await findUnnecessaryPragmaFiles(sourceFiles, options, "fix");

  for (const { file, strippedText } of unnecessary) {
    await fs.writeFile(file.absolutePath, strippedText, "utf8");
  }

  return {
    ok: true,
    violationCount: 0,
    violations: [],
    rewritten_files: unnecessary.length,
  };
}

export { collectTsNocheckAuditViolations, fixTsNocheckAuditRule };
