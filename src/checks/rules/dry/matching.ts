import { performance } from "node:perf_hooks";

import type { SourceProgressObserver } from "../../../imports/types.js";
import type { NormalizedDryRule } from "../../types.js";
import type { DryFunctionDescriptor } from "./model.js";
import {
  collectCandidateIndexes,
  createSimilarityIndex,
  createSimilarityRecord,
  indexSimilarityRecord,
  jaccardSimilarity,
  shouldCompareSimilarity,
} from "./similarity.js";
import type { SimilarityIndex, SimilarityRecord } from "./similarity.js";

const SIMILARITY_THRESHOLD = 0.99;
const DRY_MATCH_CHUNK_SIZE = 500;

type DuplicateSignal = "exact-normalized" | "matching-name" | "normalized-behavior" | "similar-structure";

type DuplicateGroup = {
  confidence: number;
  functions: DryFunctionDescriptor[];
  signals: DuplicateSignal[];
};

type DuplicateState = {
  confidenceByIndex: number[];
  disjointSet: DisjointSet;
  signalsByIndex: Array<Set<DuplicateSignal>>;
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

function createDuplicateState(size: number): DuplicateState {
  return {
    confidenceByIndex: Array.from({ length: size }, () => 0),
    disjointSet: new DisjointSet(size),
    signalsByIndex: Array.from({ length: size }, () => new Set<DuplicateSignal>()),
  };
}

function unionWithSignal(
  state: DuplicateState,
  leftIndex: number,
  rightIndex: number,
  signal: DuplicateSignal,
  confidence: number,
): void {
  state.disjointSet.union(leftIndex, rightIndex);
  state.confidenceByIndex[leftIndex] = Math.max(state.confidenceByIndex[leftIndex]!, confidence);
  state.confidenceByIndex[rightIndex] = Math.max(state.confidenceByIndex[rightIndex]!, confidence);
  state.signalsByIndex[leftIndex]!.add(signal);
  state.signalsByIndex[rightIndex]!.add(signal);
}

function unionIndexGroup(state: DuplicateState, indexes: number[], signal: DuplicateSignal): void {
  if (indexes.length < 2) return;

  const firstIndex = indexes[0]!;
  for (const index of indexes.slice(1)) {
    unionWithSignal(state, firstIndex, index, signal, 1);
  }
}

function indexExactAndNamedFunctions(functions: DryFunctionDescriptor[], options: NormalizedDryRule): {
  indexesByBehaviorFingerprint: Map<string, number[]>;
  indexesByFingerprint: Map<string, number[]>;
  indexesByName: Map<string, number[]>;
} {
  const indexesByBehaviorFingerprint = new Map<string, number[]>();
  const indexesByFingerprint = new Map<string, number[]>();
  const indexesByName = new Map<string, number[]>();

  for (let index = 0; index < functions.length; index += 1) {
    const descriptor = functions[index]!;
    if (isWithinDuplicateSizeThreshold(descriptor, options)) {
      if (descriptor.behaviorFingerprint) {
        const indexes = indexesByBehaviorFingerprint.get(descriptor.behaviorFingerprint) ?? [];
        indexes.push(index);
        indexesByBehaviorFingerprint.set(descriptor.behaviorFingerprint, indexes);
      }

      const indexes = indexesByFingerprint.get(descriptor.fingerprint) ?? [];
      indexes.push(index);
      indexesByFingerprint.set(descriptor.fingerprint, indexes);
    }

    if (shouldIndexNameDuplicate(descriptor, options)) {
      const indexes = indexesByName.get(descriptor.normalizedName!) ?? [];
      indexes.push(index);
      indexesByName.set(descriptor.normalizedName!, indexes);
    }
  }

  return { indexesByBehaviorFingerprint, indexesByFingerprint, indexesByName };
}

function isWithinDuplicateSizeThreshold(descriptor: DryFunctionDescriptor, options: NormalizedDryRule): boolean {
  return descriptor.characterCount >= options.minDuplicateCharacters;
}

function shouldIndexNameDuplicate(descriptor: DryFunctionDescriptor, options: NormalizedDryRule): boolean {
  return descriptor.classification === "standalone"
    && descriptor.topLevel
    && isWithinDuplicateSizeThreshold(descriptor, options)
    && Boolean(descriptor.normalizedName);
}

function unionExactAndNamedGroups(state: DuplicateState, functions: DryFunctionDescriptor[], options: NormalizedDryRule): void {
  const { indexesByBehaviorFingerprint, indexesByFingerprint, indexesByName } = indexExactAndNamedFunctions(functions, options);

  for (const indexes of indexesByBehaviorFingerprint.values()) {
    unionIndexGroup(state, indexes, "normalized-behavior");
  }

  for (const indexes of indexesByFingerprint.values()) {
    unionIndexGroup(state, indexes, "exact-normalized");
  }

  for (const indexes of indexesByName.values()) {
    unionIndexGroup(state, indexes, "matching-name");
  }
}

function emitMatchChunk(args: {
  comparedCandidates: number;
  completedItems: number;
  observer?: SourceProgressObserver;
  startedAt: number;
  totalItems: number;
}): void {
  if (args.completedItems % DRY_MATCH_CHUNK_SIZE !== 0 && args.completedItems !== args.totalItems) return;

  args.observer?.({
    phase: "rule-chunk",
    rule: "dry",
    stage: "match",
    chunkIndex: Math.ceil(args.completedItems / DRY_MATCH_CHUNK_SIZE),
    completedItems: args.completedItems,
    totalItems: args.totalItems,
    comparedCandidates: args.comparedCandidates,
    elapsedMs: performance.now() - args.startedAt,
  });
}

function compareSimilarityCandidates(
  record: SimilarityRecord,
  index: SimilarityIndex,
  state: DuplicateState,
  minDuplicateCharacters: number,
): number {
  let comparedCandidates = 0;

  for (const candidateIndex of collectCandidateIndexes(index, record)) {
    const candidate = index.recordsByIndex.get(candidateIndex);
    const pairKey = `${candidateIndex}:${record.index}`;
    if (!candidate || index.seenPairs.has(pairKey)) continue;

    index.seenPairs.add(pairKey);
    if (!shouldCompareSimilarity(candidate.descriptor, record.descriptor, minDuplicateCharacters)) continue;

    comparedCandidates += 1;
    const similarity = jaccardSimilarity(candidate.trigrams, record.trigrams);
    if (similarity >= SIMILARITY_THRESHOLD) {
      unionWithSignal(state, candidate.index, record.index, "similar-structure", similarity);
    }
  }

  return comparedCandidates;
}

function applyIndexedSimilarity(
  functions: DryFunctionDescriptor[],
  state: DuplicateState,
  options: NormalizedDryRule,
  observer: SourceProgressObserver | undefined,
  startedAt: number,
): number {
  const index = createSimilarityIndex();
  let comparedCandidates = 0;

  for (let functionIndex = 0; functionIndex < functions.length; functionIndex += 1) {
    const record = createSimilarityRecord(functions[functionIndex]!, functionIndex, options.minDuplicateCharacters);
    if (record) {
      comparedCandidates += compareSimilarityCandidates(record, index, state, options.minDuplicateCharacters);
      indexSimilarityRecord(index, record);
    }

    emitMatchChunk({
      comparedCandidates,
      completedItems: functionIndex + 1,
      observer,
      startedAt,
      totalItems: functions.length,
    });
  }

  return comparedCandidates;
}

function collectRootIndexes(functions: DryFunctionDescriptor[], state: DuplicateState): Map<number, number[]> {
  const indexesByRoot = new Map<number, number[]>();

  for (let index = 0; index < functions.length; index += 1) {
    const root = state.disjointSet.find(index);
    const indexes = indexesByRoot.get(root) ?? [];
    indexes.push(index);
    indexesByRoot.set(root, indexes);
  }

  return indexesByRoot;
}

function createGroup(functions: DryFunctionDescriptor[], state: DuplicateState, indexes: number[]): DuplicateGroup {
  let confidence = 0;
  const signals = new Set<DuplicateSignal>();

  for (const index of indexes) {
    confidence = Math.max(confidence, state.confidenceByIndex[index]!);
    for (const signal of state.signalsByIndex[index]!) signals.add(signal);
  }

  return {
    confidence,
    functions: indexes.map((index) => functions[index]!),
    signals: [...signals].sort(),
  };
}

function buildDuplicateGroups(functions: DryFunctionDescriptor[], state: DuplicateState): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  for (const indexes of collectRootIndexes(functions, state).values()) {
    if (indexes.length < 2) continue;
    groups.push(createGroup(functions, state, indexes));
  }

  return groups;
}

function collectDuplicateGroups(
  functions: DryFunctionDescriptor[],
  options: NormalizedDryRule,
  observer?: SourceProgressObserver,
): DuplicateGroup[] {
  const startedAt = performance.now();
  const state = createDuplicateState(functions.length);

  unionExactAndNamedGroups(state, functions, options);
  const comparedCandidates = applyIndexedSimilarity(functions, state, options, observer, startedAt);
  const groups = buildDuplicateGroups(functions, state);

  observer?.({
    phase: "rule-completed",
    rule: "dry",
    stage: "match",
    totalItems: functions.length,
    duplicateGroups: groups.length,
    comparedCandidates,
    elapsedMs: performance.now() - startedAt,
  });
  return groups;
}

export { collectDuplicateGroups };
export type { DuplicateGroup, DuplicateSignal };
