import fs from "node:fs/promises";

import ts from "typescript";

import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import { parseSource } from "../../../imports/module-specifiers.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import {
  createFunctionFingerprint,
  resolveClassification,
  resolveFunctionDisplayName,
  resolveRemovalRange,
  resolveStandaloneName,
} from "./fingerprint.js";
import type { DryCandidateDescriptor, DryHelperDescriptor, DrySourceDuplicateDescriptor } from "./model.js";

const MIN_SOURCE_DUPLICATE_CHARACTERS = 300;

function createDryViolation(
  candidate: DryCandidateDescriptor,
  options: NormalizedCheckCodeDisciplineOptions,
): CodeDisciplineViolation {
  return {
    rule: "dry",
    fix: true,
    filePath: candidate.filePath,
    message: `${candidate.localName ?? "anonymous function"} duplicates registered helper ${candidate.helper.helperKey}`,
    details: {
      fixable: candidate.safeToFix,
      helper: candidate.helper.helperKey,
      helperFile: candidate.helper.filePath,
      reason: candidate.nonFixableReason,
    },
  };
}

function createDrySourceDuplicateViolation(
  candidate: DrySourceDuplicateDescriptor,
  canonical: DrySourceDuplicateDescriptor,
): CodeDisciplineViolation {
  const candidateLine = candidate.sourceFile.getLineAndCharacterOfPosition(candidate.nodeStart).line + 1;
  const canonicalLine = canonical.sourceFile.getLineAndCharacterOfPosition(canonical.nodeStart).line + 1;

  return {
    rule: "dry",
    fix: false,
    filePath: candidate.filePath,
    message: `${candidate.localName ?? "anonymous function"} duplicates ${canonical.localName ?? "function"} in ${canonical.filePath}`,
    details: {
      fixable: false,
      reason: "source duplicate requires a canonical helper for autofix",
      duplicateOf: {
        filePath: canonical.filePath,
        line: canonicalLine,
        name: canonical.localName,
      },
      line: candidateLine,
      usesOuterScope: candidate.usesOuterScope,
      usesRestrictedRuntime: candidate.usesRestrictedRuntime,
    },
  };
}

function isFingerprintableFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (ts.isFunctionDeclaration(node) && Boolean(node.body))
    || (ts.isFunctionExpression(node) && Boolean(node.body))
    || (ts.isArrowFunction(node) && Boolean(node.body))
    || (ts.isMethodDeclaration(node) && Boolean(node.body))
    || (ts.isGetAccessorDeclaration(node) && Boolean(node.body))
    || (ts.isSetAccessorDeclaration(node) && Boolean(node.body))
    || (ts.isConstructorDeclaration(node) && Boolean(node.body));
}

function buildDrySourceDuplicate(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
  file: ScannedSourceFile,
  helpers: Map<string, DryHelperDescriptor>,
): DrySourceDuplicateDescriptor | null {
  const classification = resolveClassification(node);
  if (classification === "unsupported") return null;

  const sourceText = node.getText(sourceFile).replace(/\s+/g, "");
  if (sourceText.length < MIN_SOURCE_DUPLICATE_CHARACTERS) return null;

  const fingerprintState = createFunctionFingerprint(node, sourceFile);
  if (helpers.has(fingerprintState.fingerprint)) return null;

  return {
    absolutePath: file.absolutePath,
    classification,
    fingerprint: fingerprintState.fingerprint,
    filePath: file.relativeFromProjectRoot,
    localName: resolveFunctionDisplayName(node, sourceFile),
    nodeStart: node.getStart(sourceFile),
    sourceFile,
    usesOuterScope: fingerprintState.usesOuterScope,
    usesRestrictedRuntime: fingerprintState.usesRestrictedRuntime,
  };
}

function resolveNonFixableReason(args: {
  classification: ReturnType<typeof resolveClassification>;
  removalOk: boolean;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
}): string | undefined {
  if (args.classification === "method") return "methods are report-only in v1";
  if (args.classification !== "standalone") return "unsupported function shape";
  if (!args.removalOk) return "duplicate declaration cannot be removed safely";
  if (args.usesOuterScope) return "duplicate captures outer scope";
  if (args.usesRestrictedRuntime) return "duplicate depends on this, super, arguments, or new.target";
  return undefined;
}

function buildDryCandidate(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
  file: ScannedSourceFile,
  helpers: Map<string, DryHelperDescriptor>,
): DryCandidateDescriptor | null {
  const classification = resolveClassification(node);
  const localName = resolveStandaloneName(node);
  const removal = resolveRemovalRange(node, sourceFile);
  const fingerprintState = createFunctionFingerprint(node, sourceFile);
  const helper = helpers.get(fingerprintState.fingerprint);
  if (!helper) return null;

  const isSelf = helper.absolutePath === file.absolutePath
    && helper.nodeStart === node.getStart(sourceFile)
    && helper.nodeEnd === node.getEnd();
  if (isSelf) return null;

  const safeToFix = classification === "standalone"
    && removal.ok
    && !fingerprintState.usesOuterScope
    && !fingerprintState.usesRestrictedRuntime
    && Boolean(localName);

  return {
    absolutePath: file.absolutePath,
    classification,
    fingerprint: fingerprintState.fingerprint,
    filePath: file.relativeFromProjectRoot,
    helper,
    localName,
    nonFixableReason: resolveNonFixableReason({
      classification,
      removalOk: removal.ok,
      usesOuterScope: fingerprintState.usesOuterScope,
      usesRestrictedRuntime: fingerprintState.usesRestrictedRuntime,
    }),
    removalEnd: removal.end,
    removalStart: removal.start,
    safeToFix,
    sourceFile,
    usesOuterScope: fingerprintState.usesOuterScope,
    usesRestrictedRuntime: fingerprintState.usesRestrictedRuntime,
  };
}

async function collectDryCandidates(
  sourceFiles: ScannedSourceFile[],
  helpers: Map<string, DryHelperDescriptor>,
  options: NormalizedCheckCodeDisciplineOptions,
): Promise<DryCandidateDescriptor[]> {
  const results: DryCandidateDescriptor[] = [];

  for (const file of sourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(text, file.absolutePath);

    const visit = (node: ts.Node): void => {
      if (isFingerprintableFunction(node)) {
        const candidate = buildDryCandidate(node, sourceFile, file, helpers);
        if (candidate) results.push(candidate);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return results;
}

async function collectDrySourceDuplicateViolations(
  sourceFiles: ScannedSourceFile[],
  helpers: Map<string, DryHelperDescriptor>,
): Promise<CodeDisciplineViolation[]> {
  const byFingerprint = new Map<string, DrySourceDuplicateDescriptor[]>();

  for (const file of sourceFiles) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(text, file.absolutePath);

    const visit = (node: ts.Node): void => {
      if (isFingerprintableFunction(node)) {
        const duplicate = buildDrySourceDuplicate(node, sourceFile, file, helpers);
        if (duplicate) {
          const rows = byFingerprint.get(duplicate.fingerprint) ?? [];
          rows.push(duplicate);
          byFingerprint.set(duplicate.fingerprint, rows);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  const violations: CodeDisciplineViolation[] = [];

  for (const rows of byFingerprint.values()) {
    if (rows.length < 2) continue;

    const [canonical, ...duplicates] = rows.sort((left, right) => (
      left.filePath.localeCompare(right.filePath)
      || left.nodeStart - right.nodeStart
    ));

    for (const duplicate of duplicates) {
      violations.push(createDrySourceDuplicateViolation(duplicate, canonical!));
    }
  }

  return violations;
}

export { collectDryCandidates, collectDrySourceDuplicateViolations, createDryViolation };
