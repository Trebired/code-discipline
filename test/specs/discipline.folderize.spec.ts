import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

test("detects same-directory compound groups", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
  writeFile(projectRoot, "src/api/user-schema.ts", "export const schema = true;\n");
  writeFile(projectRoot, "src/api/keep.ts", "export const keep = true;\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {
        separators: ["_", "-"],
      },
    },
  });

  expect(result.violations).toEqual([
    {
      rule: "folderize-compound-files",
      fix: true,
      filePath: "src/api/user_route.ts",
      message: "file can be grouped under src/api/user/route.ts",
      suggestedPath: "src/api/user/route.ts",
      details: {
        mode: "same-directory-group",
        prefix: "user",
        remainder: "route",
        separator: "_",
      },
    },
    {
      rule: "folderize-compound-files",
      fix: true,
      filePath: "src/api/user-schema.ts",
      message: "file can be grouped under src/api/user/schema.ts",
      suggestedPath: "src/api/user/schema.ts",
      details: {
        mode: "same-directory-group",
        prefix: "user",
        remainder: "schema",
        separator: "-",
      },
    },
  ]);
});

test("does not try to folderize Go compound files without module-aware rewrite support", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/api/user_route.go", "package api\n");
  writeFile(projectRoot, "src/api/user_schema.go", "package api\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {},
    },
  });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
});

test("treats rule presence as enablement", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/api/user_database.ts", "export const database = true;\n");
  writeFile(projectRoot, "src/api/user_presenter.ts", "export const presenter = true;\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violationCount).toBe(2);
  expect(result.violations.map((violation) => violation.suggestedPath)).toEqual([
    "src/api/user/database.ts",
    "src/api/user/presenter.ts",
  ]);
});
