import type { DryFunctionDescriptor } from "./model.js";

const MIN_SOURCE_DUPLICATE_CHARACTERS = 300;
const SIMILARITY_LENGTH_BUCKET_SIZE = 250;
const SIMILARITY_MINHASH_COUNT = 16;
const SIMILARITY_MINHASH_BAND_SIZE = 4;
const MAX_SIMILARITY_CANDIDATES_PER_FUNCTION = 300;

type SimilarityRecord = {
  bands: string[];
  descriptor: DryFunctionDescriptor;
  index: number;
  lengthBucket: number;
  trigrams: Set<string>;
};

type SimilarityIndex = {
  indexedRecordsByBandAndLength: Map<string, number[]>;
  recordsByIndex: Map<number, SimilarityRecord>;
  seenPairs: Set<string>;
};

function getTrigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  const trigrams = new Set<string>();

  for (let index = 0; index <= padded.length - 3; index += 1) {
    trigrams.add(padded.slice(index, index + 3));
  }

  return trigrams;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSimilarityBands(minhashes: number[]): string[] {
  const bands: string[] = [];

  for (let start = 0; start + SIMILARITY_MINHASH_BAND_SIZE <= minhashes.length; start += SIMILARITY_MINHASH_BAND_SIZE) {
    bands.push(minhashes.slice(start, start + SIMILARITY_MINHASH_BAND_SIZE).join(":"));
  }

  return bands;
}

function createSimilarityRecord(descriptor: DryFunctionDescriptor, index: number): SimilarityRecord | null {
  if (descriptor.characterCount < MIN_SOURCE_DUPLICATE_CHARACTERS) return null;

  const trigrams = getTrigrams(descriptor.normalizedText);
  const minhashes = [...trigrams].map(hashString).sort((left, right) => left - right).slice(0, SIMILARITY_MINHASH_COUNT);
  const bands = createSimilarityBands(minhashes);
  if (bands.length === 0) return null;

  return {
    bands,
    descriptor,
    index,
    lengthBucket: Math.floor(descriptor.normalizedText.length / SIMILARITY_LENGTH_BUCKET_SIZE),
    trigrams,
  };
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

function createSimilarityIndex(): SimilarityIndex {
  return {
    indexedRecordsByBandAndLength: new Map(),
    recordsByIndex: new Map(),
    seenPairs: new Set(),
  };
}

function collectCandidateIndexes(index: SimilarityIndex, record: SimilarityRecord): number[] {
  const hitsByIndex = new Map<number, number>();
  const minBucket = Math.floor(record.descriptor.normalizedText.length * 0.75 / SIMILARITY_LENGTH_BUCKET_SIZE);
  const maxBucket = Math.floor(record.descriptor.normalizedText.length / 0.75 / SIMILARITY_LENGTH_BUCKET_SIZE);

  for (let bucket = minBucket; bucket <= maxBucket; bucket += 1) {
    for (const band of record.bands) {
      const indexes = index.indexedRecordsByBandAndLength.get(`${bucket}:${band}`) ?? [];
      for (const candidateIndex of indexes) {
        hitsByIndex.set(candidateIndex, (hitsByIndex.get(candidateIndex) ?? 0) + 1);
      }
    }
  }

  return sortSimilarityHits(index, record, hitsByIndex);
}

function sortSimilarityHits(index: SimilarityIndex, record: SimilarityRecord, hitsByIndex: Map<number, number>): number[] {
  return [...hitsByIndex.entries()]
    .sort((left, right) => compareSimilarityHits(index, record, left, right))
    .slice(0, MAX_SIMILARITY_CANDIDATES_PER_FUNCTION)
    .map(([candidateIndex]) => candidateIndex);
}

function compareSimilarityHits(
  index: SimilarityIndex,
  record: SimilarityRecord,
  left: [number, number],
  right: [number, number],
): number {
  const hitDifference = right[1] - left[1];
  if (hitDifference !== 0) return hitDifference;

  const leftRecord = index.recordsByIndex.get(left[0])!;
  const rightRecord = index.recordsByIndex.get(right[0])!;
  const leftDelta = Math.abs(leftRecord.descriptor.normalizedText.length - record.descriptor.normalizedText.length);
  const rightDelta = Math.abs(rightRecord.descriptor.normalizedText.length - record.descriptor.normalizedText.length);
  return leftDelta - rightDelta || left[0] - right[0];
}

function indexSimilarityRecord(index: SimilarityIndex, record: SimilarityRecord): void {
  index.recordsByIndex.set(record.index, record);

  for (const band of record.bands) {
    const key = `${record.lengthBucket}:${band}`;
    const indexes = index.indexedRecordsByBandAndLength.get(key) ?? [];
    indexes.push(record.index);
    index.indexedRecordsByBandAndLength.set(key, indexes);
  }
}

export {
  collectCandidateIndexes,
  createSimilarityIndex,
  createSimilarityRecord,
  indexSimilarityRecord,
  jaccardSimilarity,
  shouldCompareSimilarity,
};
export type { SimilarityIndex, SimilarityRecord };
