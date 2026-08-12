import { performance } from "node:perf_hooks";

import type { SourceProgressObserver } from "#pkb9x3eo56l7";

const DEFAULT_RULE_PROGRESS_CHUNK_SIZE = 250;

type RuleProgressExtras = {
  chunkBytes?: number;
  chunkItems?: number;
  comparedCandidates?: number;
  currentFile?: string;
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
  const state = {
    chunkSize: args.chunkSize ?? DEFAULT_RULE_PROGRESS_CHUNK_SIZE,
    observer: args.observer,
    rule: args.rule,
    stage: args.stage ?? "scan",
    startedAt: performance.now(),
    totalItems: args.totalItems,
  };
  emitRuleStarted(state);
  return state;
}

function emitRuleStarted(state: RuleProgressState): void {
  state.observer?.({
      phase: "rule-started",
      rule: state.rule,
      stage: state.stage,
      totalItems: state.totalItems,
      elapsedMs: 0,
  });
}

function emitRuleChunk(
  state: RuleProgressState,
  completedItems: number,
  violationCount: number,
  extras: RuleProgressExtras = {},
): void {
  if (completedItems % state.chunkSize !== 0 && completedItems !== state.totalItems) return;

  emitRuleChunkAt(state, Math.ceil(completedItems / state.chunkSize), completedItems, violationCount, extras);
}

function emitRuleChunkAt(
  state: RuleProgressState,
  chunkIndex: number,
  completedItems: number,
  violationCount: number,
  extras: RuleProgressExtras = {},
): void {
  state.observer?.({
      phase: "rule-chunk",
      rule: state.rule,
      stage: state.stage,
      chunkIndex,
      completedItems,
      totalItems: state.totalItems,
      violationCount,
      elapsedMs: performance.now() - state.startedAt,
      ...extras,
  });
}

function emitRuleChunkStarted(
  state: RuleProgressState,
  chunkIndex: number,
  completedItems: number,
  extras: Required<Pick<RuleProgressExtras, "chunkBytes"|"chunkItems">>&Pick<RuleProgressExtras, "currentFile">,
): void {
  state.observer?.({
      phase: "rule-chunk-started",
      rule: state.rule,
      stage: state.stage,
      chunkIndex,
      completedItems,
      totalItems: state.totalItems,
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

export { createRuleProgress, emitRuleChunk, emitRuleChunkAt, emitRuleChunkStarted, emitRuleCompleted, emitRuleStarted };
