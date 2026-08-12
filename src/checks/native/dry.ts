import type { CodeDisciplineViolation } from "#bsmch74up4fm";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { requireNativeBinding } from "#q6u4pcd984qa";
import { emitRuleChunkAt, emitRuleChunkStarted, type createRuleProgress } from "#efe33sls019o";

type NativeDryRuleEntry = {
  ruleConfig: unknown;
  sourceFiles: ScannedSourceFile[];
};
type NativeDryRuleChunkLimits = {
  maxBytes: number;
  maxFiles: number;
};
type NativeDryRuleBatch = {
  byteSize: number;
  files: ScannedSourceFile[];
};
type NativeCheckRulesResponse = {
  violations: CodeDisciplineViolation[];
};
type NativeDrySessionAppendResponse = {
  descriptorCount: number;
};
type NativeDryProgress = ReturnType<typeof createRuleProgress>;

function sourceFileByteSize(file: ScannedSourceFile): number {
  return Math.max(1, file.byteSize ?? 0);
}

function createNativeDryRuleBatches(
  sourceFiles: ScannedSourceFile[],
  limits: NativeDryRuleChunkLimits,
): NativeDryRuleBatch[] {
  const batches: NativeDryRuleBatch[] = [];
  let files: ScannedSourceFile[] = [];
  let byteSize = 0;

  for (const file of sourceFiles) {
    const nextSize = sourceFileByteSize(file);
    if (files.length > 0 && (files.length >= limits.maxFiles || byteSize + nextSize > limits.maxBytes)) {
      batches.push({ byteSize, files });
      files = [];
      byteSize = 0;
    }
    files.push(file);
    byteSize += nextSize;
  }

  if (files.length > 0) {
    batches.push({ byteSize, files });
  }
  return batches;
}

function appendNativeDryDescriptorBatch(args: {
    batch: NativeDryRuleBatch;
    completedItems: number;
    progress: NativeDryProgress;
    sessionId: string;
    chunkIndex: number;
}): number {
  const binding = requireNativeBinding();
  emitRuleChunkStarted(args.progress, args.chunkIndex, args.completedItems, {
      chunkBytes: args.batch.byteSize,
      chunkItems: args.batch.files.length,
      currentFile: args.batch.files[0]?.relativeFromProjectRoot,
  });
  const response = JSON.parse(binding.appendDryDescriptorsToSession(JSON.stringify({
          sessionId: args.sessionId,
          sourceFiles: args.batch.files,
  }))) as NativeDrySessionAppendResponse;
  emitRuleChunkAt(args.progress, args.chunkIndex, args.completedItems + args.batch.files.length, 0, {
      chunkBytes: args.batch.byteSize,
      chunkItems: args.batch.files.length,
      currentFile: args.batch.files[0]?.relativeFromProjectRoot,
      discoveredFunctions: response.descriptorCount,
  });
  return response.descriptorCount;
}

function finishNativeDryDescriptorSession(args: {
    chunkIndex: number;
    completedItems: number;
    descriptorCount: number;
    progress: NativeDryProgress;
    ruleConfig: unknown;
    sessionId: string;
}): CodeDisciplineViolation[] {
  const binding = requireNativeBinding();
  emitRuleChunkStarted(args.progress, args.chunkIndex, args.completedItems, {
      chunkBytes: 0,
      chunkItems: args.descriptorCount,
      currentFile: "dry duplicate matcher",
  });
  const response = JSON.parse(binding.finishDryDescriptorSession(JSON.stringify({
          sessionId: args.sessionId,
          rule: args.ruleConfig,
  }))) as NativeCheckRulesResponse;
  const violations = Array.isArray(response.violations) ? response.violations : [];
  emitRuleChunkAt(args.progress, args.chunkIndex, args.completedItems, violations.length, {
      chunkBytes: 0,
      chunkItems: args.descriptorCount,
      currentFile: "dry duplicate matcher",
  });
  return violations;
}

function runProgressiveNativeDryRule(
  entry: NativeDryRuleEntry,
  limits: NativeDryRuleChunkLimits,
  progress: NativeDryProgress,
): CodeDisciplineViolation[] {
  const binding = requireNativeBinding();
  const sessionId = binding.startDryDescriptorSession();
  let descriptorCount = 0;
  let completedItems = 0;
  let chunkIndex = 0;
  let finished = false;

  try {
    for (const batch of createNativeDryRuleBatches(entry.sourceFiles, limits)) {
      chunkIndex += 1;
      descriptorCount = appendNativeDryDescriptorBatch({
          batch,
          completedItems,
          progress,
          sessionId,
          chunkIndex,
      });
      completedItems += batch.files.length;
    }

    finished = true;
    return finishNativeDryDescriptorSession({
        chunkIndex: chunkIndex + 1,
        completedItems,
        descriptorCount,
        progress,
        ruleConfig: entry.ruleConfig,
        sessionId,
    });
  } finally {
    if (!finished) {
      binding.discardDryDescriptorSession(JSON.stringify({ sessionId }));
    }
  }
}

export { runProgressiveNativeDryRule };
