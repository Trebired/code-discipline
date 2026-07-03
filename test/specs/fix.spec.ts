import { expect, test } from "bun:test";

import { FileConflictError, fixCodeDiscipline } from "../../src/index.js";
import { fileExists, readFile, tempProject, writeFile } from "./helpers.js";

test("moves same-directory compound groups and rewrites affected imports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
  writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");
  writeFile(
    projectRoot,
    "src/app.ts",
    'import { route } from "./api/user_route";\nimport { schema } from "./api/user_schema";\nexport { route, schema };\n',
  );

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {},
    },
  });

  expect(result).toMatchObject({
    ok: true,
    violationCount: 0,
    moved_files: 2,
    rewritten_files: 1,
    rewritten_imports: 2,
    violations: [],
  });
  expect(fileExists(projectRoot, "src/api/user_route.ts")).toBe(false);
  expect(fileExists(projectRoot, "src/api/user_schema.ts")).toBe(false);
  expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(true);
  expect(fileExists(projectRoot, "src/api/user/schema.ts")).toBe(true);
  expect(readFile(projectRoot, "src/app.ts")).toContain('from "./api/user/route"');
  expect(readFile(projectRoot, "src/app.ts")).toContain('from "./api/user/schema"');
});

test("moves repeated folder-prefix files with a single match", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/api/user/user_route.ts", "export const route = true;\n");
  writeFile(projectRoot, "src/api/index.ts", 'export { route } from "./user/user_route";\n');

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {},
    },
  });

  expect(result.ok).toBe(true);
  expect(fileExists(projectRoot, "src/api/user/user_route.ts")).toBe(false);
  expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(true);
  expect(readFile(projectRoot, "src/api/index.ts")).toContain('from "./user/route"');
});

test("rejects stale folderization fix config", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
  writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");

  await expect(fixCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {
        // @ts-expect-error stale config
        fix: false,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("fails safely on file conflicts", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
  writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");
  writeFile(projectRoot, "src/api/user/route.ts", "export const existing = true;\n");

  await expect(fixCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {},
    },
  })).rejects.toBeInstanceOf(FileConflictError);
});

test("replaces a standalone DRY duplicate with an imported canonical helper", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/shared/to-text.ts", [
    "export function toText(value: unknown) {",
    "  return String(value == null ? \"\" : value).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/app.ts", [
    "export function clean(input: unknown) {",
    "  return String(input == null ? \"\" : input).trim();",
    "}",
    "",
    "export const app = clean(\"  hi  \");",
    "",
  ].join("\n"));

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        helpers: [
          {
            from: "./src/shared/to-text.ts",
            exportName: "toText",
          },
        ],
      },
    },
  });

  expect(result).toMatchObject({
    ok: true,
    violationCount: 0,
    violations: [],
    ruleResults: {
      dry: {
        ok: true,
        added_imports: 1,
        removed_duplicates: 1,
      },
    },
  });
  expect(readFile(projectRoot, "src/app.ts")).toContain('import { toText as clean } from "./shared/to-text";');
  expect(readFile(projectRoot, "src/app.ts")).not.toContain("export function clean");
});

test("reports duplicate methods without autofixing them", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/shared/to-text.ts", [
    "export function toText(value: unknown) {",
    "  return String(value == null ? \"\" : value).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/app.ts", [
    "export const formatter = {",
    "  clean(input: unknown) {",
    "    return String(input == null ? \"\" : input).trim();",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        helpers: [
          {
            from: "./src/shared/to-text.ts",
            exportName: "toText",
          },
        ],
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]).toMatchObject({
    rule: "dry",
    details: {
      fixable: false,
      reason: "methods are report-only in v1",
    },
  });
  expect(readFile(projectRoot, "src/app.ts")).toContain("clean(input: unknown)");
});

test("removes TypeScript comments while preserving literal contents", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    'const url = "https://example.com";',
    'const regex = /https?:\\/\\/example\\.com/;',
    "// remove this",
    "/* and this */",
    "export const app = { url, regex };",
    "",
  ].join("\n"));

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {},
    },
  });

  expect(result).toMatchObject({
    ok: true,
    violationCount: 0,
    rewritten_files: 1,
    removed_comments: 2,
    violations: [],
  });

  expect(readFile(projectRoot, "src/app.ts")).toBe([
    'const url = "https://example.com";',
    'const regex = /https?:\\/\\/example\\.com/;',
    "export const app = { url, regex };",
    "",
  ].join("\n"));
});

test("removes Go comments while preserving raw string contents", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/service.go", [
    "package demo",
    "",
    "var raw = `// keep /* here */`",
    'var url = "https://example.com"',
    "// remove this",
    "/* and this */",
    "func build() string {",
    "  return raw + url",
    "}",
    "",
  ].join("\n"));

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {},
    },
  });

  expect(result).toMatchObject({
    ok: true,
    rewritten_files: 1,
    removed_comments: 2,
  });

  expect(readFile(projectRoot, "src/service.go")).toBe([
    "package demo",
    "",
    "var raw = `// keep /* here */`",
    'var url = "https://example.com"',
    "func build() string {",
    "  return raw + url",
    "}",
    "",
  ].join("\n"));
});

test("removes nested Rust comments while preserving raw string contents", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/lib.rs", [
    "pub fn build<'a>() -> &'a str {",
    "    let raw = r#\"// keep /* here */\"#;",
    "    // remove this",
    "    /* outer /* inner */ and this */",
    "    raw",
    "}",
    "",
  ].join("\n"));

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {},
    },
  });

  expect(result).toMatchObject({
    ok: true,
    rewritten_files: 1,
    removed_comments: 2,
  });

  expect(readFile(projectRoot, "src/lib.rs")).toBe([
    "pub fn build<'a>() -> &'a str {",
    "    let raw = r#\"// keep /* here */\"#;",
    "    raw",
    "}",
    "",
  ].join("\n"));
});
