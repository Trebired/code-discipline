import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";

import ts from "typescript";

import { parseSource } from "../../../imports/module-specifiers.js";
import type { ScannedSourceFile, SourceProgressObserver } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import type { NormalizedDryRule } from "../../types.js";
import { createFunctionFingerprint, resolveClassification, resolveFunctionDisplayName } from "./fingerprint.js";
import { collectDuplicateGroups } from "./matching.js";
import type { DuplicateGroup } from "./matching.js";
import type { DryFunctionDescriptor } from "./model.js";

const DRY_PARSE_CHUNK_SIZE = 250;

function isFingerprintableFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (ts.isFunctionDeclaration(node) && Boolean(node.body))
    || (ts.isFunctionExpression(node) && Boolean(node.body))
    || (ts.isArrowFunction(node) && Boolean(node.body))
    || (ts.isMethodDeclaration(node) && Boolean(node.body))
    || (ts.isGetAccessorDeclaration(node) && Boolean(node.body))
    || (ts.isSetAccessorDeclaration(node) && Boolean(node.body))
    || (ts.isConstructorDeclaration(node) && Boolean(node.body));
}

function normalizeFunctionName(name: string | undefined): string | undefined {
  const normalized = name?.trim().toLowerCase();
  return normalized || undefined;
}

function isTopLevelFunction(node: ts.FunctionLikeDeclaration): boolean {
  if (ts.isFunctionDeclaration(node)) {
    return ts.isSourceFile(node.parent);
  }

  const parent = node.parent;
  if (!parent || !ts.isVariableDeclaration(parent)) return false;

  const declarationList = parent.parent;
  const statement = declarationList.parent;
  return ts.isVariableDeclarationList(declarationList)
    && ts.isVariableStatement(statement)
    && ts.isSourceFile(statement.parent);
}

function buildDryFunctionDescriptor(
  node: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
  file: ScannedSourceFile,
): DryFunctionDescriptor | null {
  const classification = resolveClassification(node);
  if (classification === "unsupported") return null;

  const sourceText = node.getText(sourceFile).replace(/\s+/g, "");
  const fingerprintState = createFunctionFingerprint(node, sourceFile);
  const localName = resolveFunctionDisplayName(node, sourceFile);

  return {
    absolutePath: file.absolutePath,
    characterCount: sourceText.length,
    classification,
    fingerprint: fingerprintState.fingerprint,
    filePath: file.relativeFromProjectRoot,
    localName,
    normalizedName: normalizeFunctionName(localName),
    nodeStart: node.getStart(sourceFile),
    normalizedText: fingerprintState.fingerprint,
    sourceFile,
    topLevel: isTopLevelFunction(node),
    usesOuterScope: fingerprintState.usesOuterScope,
    usesRestrictedRuntime: fingerprintState.usesRestrictedRuntime,
  };
}

async function collectDryFunctions(sourceFiles: ScannedSourceFile[], observer?: SourceProgressObserver): Promise<DryFunctionDescriptor[]> {
  const startedAt = performance.now();
  const functions: DryFunctionDescriptor[] = [];

  for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex += 1) {
    const file = sourceFiles[fileIndex]!;
    const text = await fs.readFile(file.absolutePath, "utf8");
    const sourceFile = parseSource(text, file.absolutePath);

    const visit = (node: ts.Node): void => {
      if (isFingerprintableFunction(node)) {
        const descriptor = buildDryFunctionDescriptor(node, sourceFile, file);
        if (descriptor) functions.push(descriptor);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    const completedItems = fileIndex + 1;
    if (completedItems % DRY_PARSE_CHUNK_SIZE === 0 || completedItems === sourceFiles.length) {
      observer?.({
        phase: "rule-chunk",
        rule: "dry",
        stage: "parse",
        chunkIndex: Math.ceil(completedItems / DRY_PARSE_CHUNK_SIZE),
        completedItems,
        totalItems: sourceFiles.length,
        discoveredFunctions: functions.length,
        elapsedMs: performance.now() - startedAt,
      });
    }
  }

  const sortedFunctions = functions.sort((left, right) => left.filePath.localeCompare(right.filePath) || left.nodeStart - right.nodeStart);
  observer?.({
    phase: "rule-completed",
    rule: "dry",
    stage: "parse",
    totalItems: sourceFiles.length,
    discoveredFunctions: sortedFunctions.length,
    elapsedMs: performance.now() - startedAt,
  });
  return sortedFunctions;
}

function formatFunctionLocation(descriptor: DryFunctionDescriptor): string {
  return descriptor.localName
    ? `${descriptor.filePath}#${descriptor.localName}`
    : descriptor.filePath;
}

function createDryGroupViolation(group: DuplicateGroup): CodeDisciplineViolation {
  const files = [...new Set(group.functions.map((descriptor) => descriptor.filePath))];

  return {
    rule: "dry",
    fix: false,
    filePath: "multiple files",
    message: "duplicate function group",
    details: {
      confidence: Number(group.confidence.toFixed(3)),
      files,
      fixable: false,
      functions: group.functions.map((descriptor) => ({
        classification: descriptor.classification,
        filePath: descriptor.filePath,
        line: descriptor.sourceFile.getLineAndCharacterOfPosition(descriptor.nodeStart).line + 1,
        name: descriptor.localName,
        topLevel: descriptor.topLevel,
      })),
      locations: group.functions.map(formatFunctionLocation),
      reason: "duplicate function group requires human canonicalization",
      signals: group.signals,
    },
  };
}

async function collectDrySourceDuplicateViolations(
  sourceFiles: ScannedSourceFile[],
  rule: NormalizedDryRule,
  observer?: SourceProgressObserver,
): Promise<CodeDisciplineViolation[]> {
  const functions = await collectDryFunctions(sourceFiles, observer);
  return collectDuplicateGroups(functions, rule, observer).map(createDryGroupViolation);
}

export { collectDrySourceDuplicateViolations };
