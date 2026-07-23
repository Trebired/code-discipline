import { expect, test } from "bun:test";

import { syncImports } from "../../../src/index.js";
import { fileExists, readFile, readJson, tempProject, writeFile } from "../helpers.js";

function folderModeOptions(projectRoot: string) {
  return {
    projectRoot,
    alias: { strategy: "relative-path-slug" as const },
    allowRelative: [],
    importsFolder: {
      enabled: true,
      maxEntriesPerFile: 2,
    },
    generatedTsconfig: {
      enabled: true,
      path: ".code-discipline/generated/tsconfig.paths.json",
    },
    packageJsonImports: {
      enabled: false,
      aliasPrefix: "#",
    },
  };
}

function writeMigrationFixture(projectRoot: string) {
  writeFile(projectRoot, "package.json", JSON.stringify({
    name: "example-package",
    imports: {
      "#legacy": "./src/legacy.ts",
      "vendor": "./vendor/runtime.js",
    },
  }, null, 2));
  writeFile(projectRoot, "tsconfig.json", JSON.stringify({
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "#app": ["src/app.ts"],
      },
    },
  }, null, 2));
  writeFile(projectRoot, "src/app.ts", 'import { util } from "./shared/util";\nexport { util };\n');
  writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");
  writeFile(projectRoot, "src/legacy.ts", "export const legacy = true;\n");
}

function expectMigratedProject(projectRoot: string) {
  expect(readJson(projectRoot, "imports/1.json")).toEqual({
    "#app": "./src/app.ts",
    "#legacy": "./src/legacy.ts",
  });
  expect(readJson(projectRoot, "imports/2.json")).toEqual({
    "#shared-util": "./src/shared/util.ts",
  });
  expect(readJson(projectRoot, ".code-discipline/generated/tsconfig.paths.json")).toEqual({
    compilerOptions: {
      paths: {
        "#app": ["../../src/app.ts"],
        "#legacy": ["../../src/legacy.ts"],
        "#shared-util": ["../../src/shared/util.ts"],
      },
    },
  });

  const tsconfig = readJson(projectRoot, "tsconfig.json");
  expect(tsconfig.extends).toBe("./.code-discipline/generated/tsconfig.paths.json");
  expect(tsconfig.compilerOptions.paths).toBeUndefined();
  expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();
  expect(readJson(projectRoot, "package.json").imports).toEqual({
    vendor: "./vendor/runtime.js",
  });
  expect(readFile(projectRoot, "src/app.ts")).toContain('from "#shared-util"');
}

test("imports folder mode migrates inline paths and package imports into generated tsconfig", async () => {
  const projectRoot = tempProject();
  writeMigrationFixture(projectRoot);

  const checkResult = await syncImports({ ...folderModeOptions(projectRoot), fix: false });
  expect(checkResult.ok).toBe(false);
  expect(checkResult.violations).toContainEqual(expect.objectContaining({
    message: "imports folder and generated tsconfig are out of sync",
  }));

  const fixResult = await syncImports({ ...folderModeOptions(projectRoot), fix: true });
  expect(fixResult.ok).toBe(true);
  expectMigratedProject(projectRoot);

  const cleanResult = await syncImports({ ...folderModeOptions(projectRoot), fix: false });
  expect(cleanResult.ok).toBe(true);
});

test("imports folder mode reports oversize source files and fix splits them", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "imports/custom.json", JSON.stringify({
    "#a": "./src/a.ts",
    "#b": "./src/b.ts",
    "#c": "./src/c.ts",
  }, null, 2));
  writeFile(projectRoot, "src/a.ts", "export const a = true;\n");
  writeFile(projectRoot, "src/b.ts", "export const b = true;\n");
  writeFile(projectRoot, "src/c.ts", "export const c = true;\n");

  const checkResult = await syncImports({
    projectRoot,
    fix: false,
    importsFolder: {
      enabled: true,
      maxEntriesPerFile: 2,
    },
  });
  const drift = checkResult.violations[0]?.details.drift as { maxEntriesExceeded?: unknown[] } | undefined;

  expect(checkResult.ok).toBe(false);
  expect(drift?.maxEntriesExceeded).toEqual([
    expect.objectContaining({
      count: 3,
      max: 2,
    }),
  ]);

  await syncImports({
    projectRoot,
    fix: true,
    importsFolder: {
      enabled: true,
      maxEntriesPerFile: 2,
    },
  });

  expect(fileExists(projectRoot, "imports/custom.json")).toBe(false);
  expect(Object.keys(readJson(projectRoot, "imports/1.json"))).toHaveLength(2);
  expect(Object.keys(readJson(projectRoot, "imports/2.json"))).toHaveLength(1);
});

test("imports folder mode can materialize package json imports for runtime", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "package.json", JSON.stringify({ name: "runtime-package" }, null, 2));
  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "imports/1.json", JSON.stringify({
    "#app": "./src/app.ts",
  }, null, 2));
  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await syncImports({
    projectRoot,
    fix: true,
    importsFolder: {
      enabled: true,
    },
    packageJsonImports: {
      enabled: true,
      aliasPrefix: "#",
    },
  });

  expect(readJson(projectRoot, "package.json").imports).toEqual({
    "#app": "./src/app.ts",
  });
});
