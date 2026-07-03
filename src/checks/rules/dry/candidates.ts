import fs from "node:fs/promises";

import ts from "typescript";

import type { NormalizedCheckCodeDisciplineOptions } from "../../types.js";
import { parseSource } from "../../../imports/module-specifiers.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import {
  createFunctionFingerprint,
  resolveClassification,
  resolveRemovalRange,
  resolveStandaloneName,
} from "./fingerprint.js";
import type { DryCandidateDescriptor, DryHelperDescriptor } from "./model.js";

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

function isFingerprintableFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (ts.isFunctionDeclaration(node) && Boolean(node.body))
    || (ts.isFunctionExpression(node) && Boolean(node.body))
    || (ts.isArrowFunction(node) && Boolean(node.body))
    || (ts.isMethodDeclaration(node) && Boolean(node.body))
    || (ts.isGetAccessorDeclaration(node) && Boolean(node.body))
    || (ts.isSetAccessorDeclaration(node) && Boolean(node.body))
    || (ts.isConstructorDeclaration(node) && Boolean(node.body));
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

export { collectDryCandidates, createDryViolation };
