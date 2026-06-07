import { describe, expect, test } from "bun:test";

import { FileConflictError, fixCodeDiscipline } from "../../src/index.js";
import { fileExists, readFile, tempProject, writeFile } from "./helpers.js";

describe("code-discipline fix", () => {
  test("moves same-directory compound groups and rewrites affected imports when fix is true", async () => {
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
        folderizeCompoundFiles: {
          fix: true,
        },
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
        folderizeCompoundFiles: {
          fix: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(fileExists(projectRoot, "src/api/user/user_route.ts")).toBe(false);
    expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(true);
    expect(readFile(projectRoot, "src/api/index.ts")).toContain('from "./user/route"');
  });

  test("does not move files when folderization fix is disabled and keeps violations", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");

    const result = await fixCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          fix: false,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.violationCount).toBe(2);
    expect(result.moved_files).toBe(0);
    expect(fileExists(projectRoot, "src/api/user_route.ts")).toBe(true);
    expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(false);
  });

  test("fails safely on file conflicts", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");
    writeFile(projectRoot, "src/api/user/route.ts", "export const existing = true;\n");

    await expect(fixCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          fix: true,
        },
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
          fix: true,
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
          fix: true,
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
});
