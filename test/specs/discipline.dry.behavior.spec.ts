import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

test("reports normalized behavior duplicates across fallback syntax variants", async () => {
  const projectRoot = tempProject();

  writeFallbackFixtures(projectRoot);

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]).toMatchObject({
    details: {
      files: ["src/string-a.ts", "src/string-b.ts", "src/string-c.ts", "src/string-d.ts", "src/string-e.ts"],
      functions: [
        expect.objectContaining({ name: "safeString" }),
        expect.objectContaining({ name: "toText" }),
        expect.objectContaining({ name: "normalizeText" }),
        expect.objectContaining({ name: "safeTrim" }),
        expect.objectContaining({ name: "text" }),
      ],
      signals: expect.arrayContaining(["normalized-behavior"]),
    },
  });
});

test("reports normalized behavior duplicates across direct and branched number guards", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/number-a.ts", [
    "export function toNullableNumber(value: unknown) {",
    "  const parsed = Number(value);",
    "  return Number.isFinite(parsed) ? parsed : null;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/number-b.ts", [
    "export function toCount(input: unknown) {",
    "  const next = Number(input);",
    "  if (!Number.isFinite(next)) return null;",
    "  return next;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/number-c.ts", [
    "export function toZeroNumber(candidate: unknown) {",
    "  const next = Number(candidate);",
    "  return Number.isFinite(next) ? next : 0;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {},
    },
  });
  const normalizedGroup = findGroupWithFunction(result.violations, "toNullableNumber");

  expect(normalizedGroup).toMatchObject({
    details: {
      functions: [
        expect.objectContaining({ name: "toNullableNumber" }),
        expect.objectContaining({ name: "toCount" }),
      ],
      signals: expect.arrayContaining(["normalized-behavior"]),
    },
  });
  expect(JSON.stringify(normalizedGroup?.details.functions)).not.toContain("toZeroNumber");
});

test("reports normalized behavior duplicates across clamped percent helper forms", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/percent-a.ts", [
    "export function clampPercent(value: unknown, fallback = 0) {",
    "  const next = Number(value);",
    "  if (!Number.isFinite(next)) return Math.max(0, Math.min(100, Number(fallback) || 0));",
    "  return Math.max(0, Math.min(100, next));",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/percent-b.ts", [
    "export function boundedPercent(input: unknown, backup = 0) {",
    "  const parsed = Number(input);",
    "  const safeFallback = Math.max(0, Math.min(100, Number(backup) || 0));",
    "  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : safeFallback;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]).toMatchObject({
    details: {
      functions: [
        expect.objectContaining({ name: "clampPercent" }),
        expect.objectContaining({ name: "boundedPercent" }),
      ],
      signals: expect.arrayContaining(["normalized-behavior"]),
    },
  });
});

test("reports normalized behavior duplicates across object guard forms", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/object-a.ts", [
    "export function objectOrNull(value: unknown) {",
    "  return Boolean(value) && typeof value === \"object\" && !Array.isArray(value) ? value : null;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/object-b.ts", [
    "export function asObject(input: unknown) {",
    "  if (!input || typeof input !== \"object\" || Array.isArray(input)) return null;",
    "  return input;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]).toMatchObject({
    details: {
      functions: [
        expect.objectContaining({ name: "objectOrNull" }),
        expect.objectContaining({ name: "asObject" }),
      ],
      signals: expect.arrayContaining(["normalized-behavior"]),
    },
  });
});

test("does not merge similar helpers with different behavior", async () => {
  const projectRoot = tempProject();

  writeDifferentBehaviorFixtures(projectRoot);

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {},
    },
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toHaveLength(0);
});

function writeFallbackFixtures(projectRoot: string): void {
  writeFile(projectRoot, "src/string-a.ts", [
    "export function safeString(value: unknown) {",
    "  return String(value ?? \"\").trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/string-b.ts", [
    "export function toText(input: unknown) {",
    "  const raw = input == null ? \"\" : input;",
    "  return String(raw).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/string-c.ts", [
    "export function normalizeText(candidate: unknown) {",
    "  return String(candidate === null || candidate === undefined ? \"\" : candidate).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/string-d.ts", [
    "export function safeTrim(entry: unknown) {",
    "  if (entry == null) return \"\";",
    "  return String(entry).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/string-e.ts", [
    "export function text(item: unknown) {",
    "  if (item !== null && item !== undefined) return String(item).trim();",
    "  return \"\";",
    "}",
    "",
  ].join("\n"));
}

function writeDifferentBehaviorFixtures(projectRoot: string): void {
  writeFile(projectRoot, "src/string-a.ts", [
    "export function coerceText(value: unknown) {",
    "  return String(value ?? \"\").trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/string-b.ts", [
    "export function stringOnly(input: unknown) {",
    "  return typeof input === \"string\" ? input.trim() : \"\";",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/number-a.ts", [
    "export function nullableNumber(value: unknown) {",
    "  const next = Number(value);",
    "  return Number.isFinite(next) ? next : null;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/number-b.ts", [
    "export function zeroNumber(input: unknown) {",
    "  const parsed = Number(input);",
    "  if (!Number.isFinite(parsed)) return 0;",
    "  return parsed;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/object-a.ts", [
    "export function objectWithArrays(value: unknown) {",
    "  return value && typeof value === \"object\" ? value : null;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/object-b.ts", [
    "export function objectWithoutArrays(input: unknown) {",
    "  if (!input || typeof input !== \"object\" || Array.isArray(input)) return null;",
    "  return input;",
    "}",
    "",
  ].join("\n"));
}

function findGroupWithFunction(violations: Awaited<ReturnType<typeof checkCodeDiscipline>>["violations"], name: string) {
  return violations.find((violation) => (
    Array.isArray(violation.details.signals)
      && violation.details.signals.includes("normalized-behavior")
      && Array.isArray(violation.details.functions)
      && violation.details.functions.some((entry) => (
        typeof entry === "object"
          && entry !== null
          && "name" in entry
          && entry.name === name
      ))
  ));
}
