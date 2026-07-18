import fs from "node:fs/promises";

import ts from "typescript";

import { parseSource } from "../../../imports/module-specifiers.js";
import type { ScannedSourceFile } from "../../../imports/types.js";
import type { CodeDisciplineViolation } from "../../../shared/discipline-types.js";
import { createFunctionFingerprint, resolveClassification, resolveFunctionDisplayName } from "./fingerprint.js";
import type { DryFunctionDescriptor } from "./model.js";

const MIN_SOURCE_DUPLICATE_CHARACTERS = 300;
const MIN_NAME_DUPLICATE_CHARACTERS = 300;
const SIMILARITY_THRESHOLD = 0.99;

type DuplicateSignal = "exact-normalized" | "matching-name" | "similar-structure";

type DuplicateGroup = {
  confidence: number;
  functions: DryFunctionDescriptor[];
  signals: DuplicateSignal[];
};

class DisjointSet {
  private readonly parents: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    const parent = this.parents[index]!;
    if (parent === index) return index;

    const root = this.find(parent);
    this.parents[index] = root;
    return root;
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    this.parents[rightRoot] = leftRoot;
  }
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

async function collectDryFunctions(sourceFiles: ScannedSourceFile[]): Promise<DryFunctionDescriptor[]> {
  const functions: DryFunctionDescriptor[] = [];

  for (const file of sourceFiles) {
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
  }

  return functions.sort((left, right) => left.filePath.localeCompare(right.filePath) || left.nodeStart - right.nodeStart);
}

function getTrigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  const trigrams = new Set<string>();

  for (let index = 0; index <= padded.length - 3; index += 1) {
    trigrams.add(padded.slice(index, index + 3));
  }

  return trigrams;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  let intersection = 0;

  for (const entry of left) {
    if (right.has(entry)) intersection += 1;
  }

  const union = left.size + right.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function shouldCompareSimilarity(left: DryFunctionDescriptor, right: DryFunctionDescriptor): boolean {
  if (left.characterCount < MIN_SOURCE_DUPLICATE_CHARACTERS || right.characterCount < MIN_SOURCE_DUPLICATE_CHARACTERS) return false;

  const smaller = Math.min(left.normalizedText.length, right.normalizedText.length);
  const larger = Math.max(left.normalizedText.length, right.normalizedText.length);
  return smaller / larger >= 0.75;
}

function resolvePairSignals(left: DryFunctionDescriptor, right: DryFunctionDescriptor): Array<{
  confidence: number;
  signal: DuplicateSignal;
}> {
  const signals: Array<{ confidence: number; signal: DuplicateSignal }> = [];

  if (left.fingerprint === right.fingerprint && left.characterCount >= MIN_SOURCE_DUPLICATE_CHARACTERS && right.characterCount >= MIN_SOURCE_DUPLICATE_CHARACTERS) {
    signals.push({ confidence: 1, signal: "exact-normalized" });
  }

  if (
    left.classification === "standalone"
    && right.classification === "standalone"
    && left.topLevel
    && right.topLevel
    && left.characterCount >= MIN_NAME_DUPLICATE_CHARACTERS
    && right.characterCount >= MIN_NAME_DUPLICATE_CHARACTERS
    && left.normalizedName
    && left.normalizedName === right.normalizedName
  ) {
    signals.push({ confidence: 1, signal: "matching-name" });
  }

  if (shouldCompareSimilarity(left, right)) {
    const similarity = jaccardSimilarity(getTrigrams(left.normalizedText), getTrigrams(right.normalizedText));
    if (similarity >= SIMILARITY_THRESHOLD) {
      signals.push({ confidence: similarity, signal: "similar-structure" });
    }
  }

  return signals;
}

function collectDuplicateGroups(functions: DryFunctionDescriptor[]): DuplicateGroup[] {
  const disjointSet = new DisjointSet(functions.length);
  const groupSignals = new Map<string, { confidence: number; signals: Set<DuplicateSignal> }>();

  for (let leftIndex = 0; leftIndex < functions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < functions.length; rightIndex += 1) {
      const signals = resolvePairSignals(functions[leftIndex]!, functions[rightIndex]!);
      if (signals.length === 0) continue;

      disjointSet.union(leftIndex, rightIndex);

      const key = `${leftIndex}:${rightIndex}`;
      groupSignals.set(key, {
        confidence: Math.max(...signals.map((signal) => signal.confidence)),
        signals: new Set(signals.map((signal) => signal.signal)),
      });
    }
  }

  const indexesByRoot = new Map<number, number[]>();
  for (let index = 0; index < functions.length; index += 1) {
    const root = disjointSet.find(index);
    const indexes = indexesByRoot.get(root) ?? [];
    indexes.push(index);
    indexesByRoot.set(root, indexes);
  }

  const groups: DuplicateGroup[] = [];

  for (const indexes of indexesByRoot.values()) {
    if (indexes.length < 2) continue;

    let confidence = 0;
    const signals = new Set<DuplicateSignal>();

    for (const [key, entry] of groupSignals) {
      const [left, right] = key.split(":").map((value) => Number.parseInt(value, 10));
      if (!indexes.includes(left) || !indexes.includes(right)) continue;

      confidence = Math.max(confidence, entry.confidence);
      for (const signal of entry.signals) signals.add(signal);
    }

    groups.push({
      confidence,
      functions: indexes.map((index) => functions[index]!),
      signals: [...signals].sort(),
    });
  }

  return groups;
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
    message: `function duplicates in files: ${files.join(", ")}`,
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

async function collectDrySourceDuplicateViolations(sourceFiles: ScannedSourceFile[]): Promise<CodeDisciplineViolation[]> {
  const functions = await collectDryFunctions(sourceFiles);
  return collectDuplicateGroups(functions).map(createDryGroupViolation);
}

export { collectDrySourceDuplicateViolations };
