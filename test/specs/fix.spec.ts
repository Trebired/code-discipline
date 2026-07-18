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

test("deletes banned files during fix", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
  writeFile(projectRoot, "src/app.spec.ts", "export const spec = true;\n");
  writeFile(projectRoot, "src/feature/app.spec.tsx", "export const spec = true;\n");

  const result = await fixCodeDiscipline({
    projectRoot,
    onlyRules: ["banned-files"],
    rules: {
      bannedFiles: {
        patterns: [
          { glob: "**/*.spec.ts" },
          { glob: "**/*.spec.tsx" },
        ],
      },
    },
  });

  expect(result).toMatchObject({
    ok: true,
    violationCount: 0,
    deleted_files: 2,
    violations: [],
    ruleResults: {
      "banned-files": {
        ok: true,
        deleted_files: 2,
      },
    },
  });
  expect(fileExists(projectRoot, "src/app.ts")).toBe(true);
  expect(fileExists(projectRoot, "src/app.spec.ts")).toBe(false);
  expect(fileExists(projectRoot, "src/feature/app.spec.tsx")).toBe(false);
});

test("rejects dry as a fix selector", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(fixCodeDiscipline({
    projectRoot,
    // @ts-expect-error dry is check-only
    onlyRules: ["dry"],
    rules: {
      dry: {},
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
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

test("preserves excluded comments during remove-comments fixes", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", [
    "// @ts-nocheck",
    "// remove this",
    "export const app = true;",
    "",
  ].join("\n"));

  const result = await fixCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {
        exclude: ["@ts-nocheck"],
      },
    },
  });

  expect(result).toMatchObject({
    ok: true,
    violationCount: 0,
    rewritten_files: 1,
    removed_comments: 1,
    violations: [],
  });

  expect(readFile(projectRoot, "src/app.ts")).toBe([
    "// @ts-nocheck",
    "export const app = true;",
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
