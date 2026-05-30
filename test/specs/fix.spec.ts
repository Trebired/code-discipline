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
          enabled: true,
          stop: true,
          fix: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.moved_files).toBe(2);
    expect(result.rewritten_imports).toBe(2);
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
          enabled: true,
          stop: true,
          fix: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(fileExists(projectRoot, "src/api/user/user_route.ts")).toBe(false);
    expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(true);
    expect(readFile(projectRoot, "src/api/index.ts")).toContain('from "./user/route"');
  });

  test("does not move files when folderization fix is disabled", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");

    const result = await fixCodeDiscipline({
      projectRoot,
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
          stop: true,
          fix: false,
        },
      },
    });

    expect(result.ok).toBe(false);
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
          enabled: true,
          stop: true,
          fix: true,
        },
      },
    })).rejects.toBeInstanceOf(FileConflictError);
  });
});
