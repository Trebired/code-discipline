import { performance } from "node:perf_hooks";

import type { SourceProgressObserver } from "../imports/types.js";

const DEFAULT_RULE_PROGRESS_CHUNK_SIZE = 250;

type RuleProgressExtras = {
  comparedCandidates?: number;
  deletedFiles?: number;
  discoveredFunctions?: number;
  duplicateGroups?: number;
  movedFiles?: number;
  removedComments?: number;
  rewrittenFiles?: number;
  rewrittenImports?: number;
};

type RuleProgressState = {
  chunkSize: number;
  observer?: SourceProgressObserver;
  rule: string;
  stage: string;
  startedAt: number;
  totalItems: number;
};

function createRuleProgress(args: {
  chunkSize?: number;
  observer?: SourceProgressObserver;
  rule: string;
  stage?: string;
  totalItems: number;
}): RuleProgressState {
  return {
    chunkSize: args.chunkSize ?? DEFAULT_RULE_PROGRESS_CHUNK_SIZE,
    observer: args.observer,
    rule: args.rule,
    stage: args.stage ?? "scan",
    startedAt: performance.now(),
    totalItems: args.totalItems,
  };
}

function emitRuleChunk(
  state: RuleProgressState,
  completedItems: number,
  violationCount: number,
  extras: RuleProgressExtras = {},
): void {
  if (completedItems % state.chunkSize !== 0 && completedItems !== state.totalItems) return;

  state.observer?.({
    phase: "rule-chunk",
    rule: state.rule,
    stage: state.stage,
    chunkIndex: Math.ceil(completedItems / state.chunkSize),
    completedItems,
    totalItems: state.totalItems,
    violationCount,
    elapsedMs: performance.now() - state.startedAt,
    ...extras,
  });
}

function emitRuleCompleted(
  state: RuleProgressState,
  violationCount: number,
  extras: RuleProgressExtras = {},
): void {
  state.observer?.({
    phase: "rule-completed",
    rule: state.rule,
    stage: state.stage,
    totalItems: state.totalItems,
    violationCount,
    elapsedMs: performance.now() - state.startedAt,
    ...extras,
  });
}

export { createRuleProgress, emitRuleChunk, emitRuleCompleted };
