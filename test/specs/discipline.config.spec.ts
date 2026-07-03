import { expect, test } from "bun:test";

import { checkCodeDiscipline, loadResolvedCodeDisciplineConfig } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

test("rejects removed enabled keys for line-limit rules", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        // @ts-expect-error legacy config
        enabled: true,
        max: 5,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFunctionLines: {
        // @ts-expect-error legacy config
        enabled: true,
        max: 5,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("loads TypeScript config modules with relative local imports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/config-helper.ts", [
    "export function defineLocalConfig(value: unknown) {",
    "  return value;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "tb.code-discipline.ts", [
    "import { defineLocalConfig } from \"./src/config-helper.js\";",
    "",
    "export default defineLocalConfig({",
    "  sourceRoot: \"src\",",
    "  rules: {",
    "    maxFileLines: { max: 10 },",
    "  },",
    "});",
    "",
  ].join("\n"));

  const loaded = await loadResolvedCodeDisciplineConfig(projectRoot);

  expect(loaded.config).toEqual({
    sourceRoot: "src",
    rules: {
      maxFileLines: {
        max: 10,
      },
    },
  });
});

test("rejects removed keys for folderizeCompoundFiles", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {
        // @ts-expect-error legacy config
        stop: true,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {
        // @ts-expect-error stale config
        fix: true,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects removed enabled and fix keys for syncImports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      syncImports: {
        // @ts-expect-error legacy config
        enabled: true,
        alias: {
          strategy: "relative-path-slug",
        },
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      syncImports: {
        // @ts-expect-error stale config
        fix: true,
        alias: {
          strategy: "relative-path-slug",
        },
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects removed fix keys for dry", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        // @ts-expect-error stale config
        fix: true,
        helpers: [
          {
            from: "./src/shared/to-text.ts",
            exportName: "toText",
          },
        ],
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("reports DRY duplicates despite renamed parameters and comments", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/shared/to-text.ts", [
    "export function toText(value: unknown) {",
    "  return String(value == null ? \"\" : value).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/app.ts", [
    "export function clean(input: unknown) {",
    "  // normalize the text",
    "  return String(input == null ? \"\" : input).trim();",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
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
    filePath: "src/app.ts",
    details: {
      fixable: true,
      helper: "./src/shared/to-text.ts#toText",
    },
  });
});

test("fails clearly when a DRY helper export cannot be resolved", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/shared/to-text.ts", "export const value = 1;\n");
  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
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
  })).rejects.toThrow("dry helper export is not a supported function");
});
