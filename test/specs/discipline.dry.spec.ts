import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

test("rejects removed fix and helpers keys for dry", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        // @ts-expect-error stale config
        fix: true,
      },
    },
  })).rejects.toMatchObject({ code: "invalid_config" });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        // @ts-expect-error removed config
        helpers: [
          {
            from: "./src/shared/to-text.ts",
            exportName: "toText",
          },
        ],
      },
    },
  })).rejects.toMatchObject({ code: "invalid_config" });
});

test("reports DRY duplicates despite renamed parameters and comments", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/shared/to-text.ts", [
    "export function toText(value: unknown, fallback: string) {",
    "  const raw = value == null ? fallback : value;",
    "  const normalized = String(raw).replace(/\\s+/g, \" \").trim();",
    "  const lower = normalized.toLowerCase();",
    "  const parts = lower.split(\" \").filter(Boolean);",
    "  const joined = parts.join(\"-\");",
    "  if (joined.length > 120) return joined.slice(0, 120);",
    "  return joined;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/app.ts", [
    "export function clean(input: unknown, backup: string) {",
    "  // normalize the text",
    "  const source = input == null ? backup : input;",
    "  const collapsed = String(source).replace(/\\s+/g, \" \").trim();",
    "  const lowerCase = collapsed.toLowerCase();",
    "  const chunks = lowerCase.split(\" \").filter(Boolean);",
    "  const slug = chunks.join(\"-\");",
    "  if (slug.length > 120) return slug.slice(0, 120);",
    "  return slug;",
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
    rule: "dry",
    fix: false,
    filePath: "multiple files",
    message: "duplicate function group",
    details: {
      files: ["src/app.ts", "src/shared/to-text.ts"],
      fixable: false,
      signals: ["exact-normalized", "similar-structure"],
    },
  });
});

test("reports same-name DRY duplicates as high confidence", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/one.ts", [
    "export function normalize(value: { name?: string; email?: string }) {",
    "  const name = String(value.name ?? \"\").trim();",
    "  const email = String(value.email ?? \"\").trim();",
    "  const normalizedName = name.replace(/\\s+/g, \" \");",
    "  const normalizedEmail = email.toLowerCase();",
    "  const domain = normalizedEmail.includes(\"@\") ? normalizedEmail.split(\"@\")[1] : \"\";",
    "  return domain ? `${normalizedName} <${normalizedEmail}>` : normalizedEmail;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/two.ts", [
    "export function normalize(input: { title?: string; phone?: string }) {",
    "  const title = String(input.title ?? \"\").trim();",
    "  const phone = String(input.phone ?? \"\").trim();",
    "  const normalizedTitle = title.replace(/\\s+/g, \" \");",
    "  const normalizedPhone = phone.toLowerCase();",
    "  const prefix = normalizedPhone.includes(\"+\") ? normalizedPhone.split(\"+\")[1] : \"\";",
    "  return prefix ? `${normalizedTitle} <${normalizedPhone}>` : normalizedPhone;",
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
    rule: "dry",
    filePath: "multiple files",
    message: "duplicate function group",
    details: {
      confidence: 1,
      files: ["src/one.ts", "src/two.ts"],
      signals: ["matching-name"],
    },
  });
});

test("reports likely DRY duplicates discovered across source files", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/one.ts", [
    "export function buildUserLabel(user: { name?: string; email?: string }) {",
    "  const name = String(user.name ?? \"\").trim();",
    "  const email = String(user.email ?? \"\").trim();",
    "  const normalizedName = name.replace(/\\s+/g, \" \");",
    "  const normalizedEmail = email.toLowerCase();",
    "  const domain = normalizedEmail.includes(\"@\") ? normalizedEmail.split(\"@\")[1] : \"\";",
    "  return domain ? `${normalizedName} <${normalizedEmail}>` : normalizedEmail;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/two.ts", [
    "export function formatAccountLabel(account: { name?: string; email?: string }) {",
    "  const displayName = String(account.name ?? \"\").trim();",
    "  const contact = String(account.email ?? \"\").trim();",
    "  const readableName = displayName.replace(/\\s+/g, \" \");",
    "  const readableContact = contact.toLowerCase();",
    "  const contactDomain = readableContact.includes(\"@\") ? readableContact.split(\"@\")[1] : \"\";",
    "  return contactDomain ? `${readableName} <${readableContact}>` : readableContact;",
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
  expect(result.violationCount).toBe(1);
  expect(result.violations[0]).toMatchObject({
    rule: "dry",
    fix: false,
    filePath: "multiple files",
    message: "duplicate function group",
    details: {
      fixable: false,
      reason: "duplicate function group requires human canonicalization",
      files: ["src/one.ts", "src/two.ts"],
    },
  });
});

test("emits DRY progress chunks after completed parse and match chunks", async () => {
  const projectRoot = tempProject();
  const progress: Array<{ completedItems?: number; phase: string; stage?: string; totalItems?: number }> = [];

  writeFile(projectRoot, "src/one.ts", [
    "export function buildUserLabel(user: { name?: string; email?: string }) {",
    "  const name = String(user.name ?? \"\").trim();",
    "  const email = String(user.email ?? \"\").trim();",
    "  const normalizedName = name.replace(/\\s+/g, \" \");",
    "  const normalizedEmail = email.toLowerCase();",
    "  const domain = normalizedEmail.includes(\"@\") ? normalizedEmail.split(\"@\")[1] : \"\";",
    "  return domain ? `${normalizedName} <${normalizedEmail}>` : normalizedEmail;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/two.ts", [
    "export function formatAccountLabel(account: { name?: string; email?: string }) {",
    "  const displayName = String(account.name ?? \"\").trim();",
    "  const contact = String(account.email ?? \"\").trim();",
    "  const readableName = displayName.replace(/\\s+/g, \" \");",
    "  const readableContact = contact.toLowerCase();",
    "  const contactDomain = readableContact.includes(\"@\") ? readableContact.split(\"@\")[1] : \"\";",
    "  return contactDomain ? `${readableName} <${readableContact}>` : readableContact;",
    "}",
    "",
  ].join("\n"));

  await checkCodeDiscipline({
    projectRoot,
    progressObserver: (event) => {
      progress.push({
        completedItems: "completedItems" in event ? event.completedItems : undefined,
        phase: event.phase,
        stage: "stage" in event ? event.stage : undefined,
        totalItems: "totalItems" in event ? event.totalItems : undefined,
      });
    },
    rules: {
      dry: {},
    },
  });

  expect(progress).toEqual(expect.arrayContaining([
    expect.objectContaining({ completedItems: 2, phase: "rule-chunk", stage: "parse", totalItems: 2 }),
    expect.objectContaining({ phase: "rule-completed", stage: "parse" }),
    expect.objectContaining({ completedItems: 2, phase: "rule-chunk", stage: "match", totalItems: 2 }),
    expect.objectContaining({ phase: "rule-completed", stage: "match" }),
  ]));
});
