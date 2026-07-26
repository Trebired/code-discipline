import { expect, test } from "bun:test";

import { syncImports } from "#co5e63fhc1wb";
import { fileExists, readFile, readJson, tempProject, writeFile } from "#ycf29mcwtaq4";

function aliasMapOptions(projectRoot: string) {
  return {
    projectRoot,
    alias: { strategy: "relative-path-slug" as const },
    allowRelative: [],
    output: {
      type: "alias-map" as const,
      maxEntriesPerFile: 2,
    },
  };
}

function writeMigrationFixture(projectRoot: string) {
  writeFile(projectRoot, "package.json", JSON.stringify({
    name: "example-package",
    imports: {
      "#legacy": "./src/legacy.ts",
      vendor: "./vendor/runtime.js",
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

function expectMigratedAliasMap(projectRoot: string) {
  expect(readJson(projectRoot, ".code-discipline/imports/1.json")).toEqual({
    "#app": "./src/app.ts",
    "#legacy": "./src/legacy.ts",
  });
  expect(readJson(projectRoot, ".code-discipline/imports/2.json")).toEqual({
    "#src-shared-util": "./src/shared/util.ts",
  });
  expect(readJson(projectRoot, ".code-discipline/generated/tsconfig.paths.json")).toEqual({
    compilerOptions: {
      paths: {
        "#app": ["../../src/app.ts"],
        "#legacy": ["../../src/legacy.ts"],
        "#src-shared-util": ["../../src/shared/util.ts"],
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
  expect(readFile(projectRoot, "src/app.ts")).toContain('from "#src-shared-util"');
}

test("alias-map output migrates inline paths and package imports into generated tsconfig", async () => {
  const projectRoot = tempProject();
  writeMigrationFixture(projectRoot);

  const checkResult = await syncImports({ ...aliasMapOptions(projectRoot), fix: false });
  expect(checkResult.ok).toBe(false);
  expect(checkResult.violations).toContainEqual(expect.objectContaining({
    message: "imports folder and generated tsconfig are out of sync",
  }));

  const fixResult = await syncImports({ ...aliasMapOptions(projectRoot), fix: true });
  expect(fixResult.ok).toBe(true);
  expectMigratedAliasMap(projectRoot);

  const cleanResult = await syncImports({ ...aliasMapOptions(projectRoot), fix: false });
  expect(cleanResult.ok).toBe(true);
});

test("alias-map output reports oversize source files and fix splits them", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, ".code-discipline/imports/custom.json", JSON.stringify({
    "#a": "./src/a.ts",
    "#b": "./src/b.ts",
    "#c": "./src/c.ts",
  }, null, 2));
  writeFile(projectRoot, "src/a.ts", "export const a = true;\n");
  writeFile(projectRoot, "src/b.ts", "export const b = true;\n");
  writeFile(projectRoot, "src/c.ts", "export const c = true;\n");

  const checkResult = await syncImports({ ...aliasMapOptions(projectRoot), fix: false });
  const drift = checkResult.violations[0]?.details.drift as { maxEntriesExceeded?: unknown[] } | undefined;

  expect(checkResult.ok).toBe(false);
  expect(drift?.maxEntriesExceeded).toEqual([
    expect.objectContaining({
      count: 3,
      max: 2,
    }),
  ]);

  await syncImports({ ...aliasMapOptions(projectRoot), fix: true });

  expect(fileExists(projectRoot, ".code-discipline/imports/custom.json")).toBe(false);
  expect(Object.keys(readJson(projectRoot, ".code-discipline/imports/1.json"))).toHaveLength(2);
  expect(Object.keys(readJson(projectRoot, ".code-discipline/imports/2.json"))).toHaveLength(1);
});

test("alias-map output prunes missing targets and repacks generated files", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, ".code-discipline/imports/1.json", JSON.stringify({
    "#a": "./src/a.ts",
  }, null, 2));
  writeFile(projectRoot, ".code-discipline/imports/2.json", JSON.stringify({
    "#missing": "./src/missing.ts",
    "#b": "./src/b.ts",
  }, null, 2));
  writeFile(projectRoot, ".code-discipline/imports/3.json", JSON.stringify({
    "#c": "./src/c.ts",
  }, null, 2));
  writeFile(projectRoot, "src/a.ts", "export const a = true;\n");
  writeFile(projectRoot, "src/b.ts", "export const b = true;\n");
  writeFile(projectRoot, "src/c.ts", "export const c = true;\n");

  const checkResult = await syncImports({ ...aliasMapOptions(projectRoot), fix: false });

  expect(checkResult.ok).toBe(false);
  expect(checkResult.violations).toContainEqual(expect.objectContaining({
    message: "imports folder and generated tsconfig are out of sync",
  }));

  await syncImports({ ...aliasMapOptions(projectRoot), fix: true });

  expect(readJson(projectRoot, ".code-discipline/imports/1.json")).toEqual({
    "#a": "./src/a.ts",
    "#b": "./src/b.ts",
  });
  expect(readJson(projectRoot, ".code-discipline/imports/2.json")).toEqual({
    "#c": "./src/c.ts",
  });
  expect(fileExists(projectRoot, ".code-discipline/imports/3.json")).toBe(false);
});

test("project-manifests output migrates alias-map files into tsconfig and package json", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "package.json", JSON.stringify({ name: "runtime-package" }, null, 2));
  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, ".code-discipline/imports/1.json", JSON.stringify({
    "#app": "./src/app.ts",
  }, null, 2));
  writeFile(projectRoot, ".code-discipline/generated/tsconfig.paths.json", JSON.stringify({
    compilerOptions: {
      paths: {
        "#app": ["../../src/app.ts"],
      },
    },
  }, null, 2));
  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await syncImports({
    projectRoot,
    fix: true,
    output: {
      type: "project-manifests",
    },
  });

  expect(readJson(projectRoot, "tsconfig.json").compilerOptions.paths).toEqual({
    "#app": ["./src/app.ts"],
  });
  expect(readJson(projectRoot, "package.json").imports).toEqual({
    "#app": "./src/app.ts",
  });
  expect(fileExists(projectRoot, ".code-discipline/imports/1.json")).toBe(false);
  expect(fileExists(projectRoot, ".code-discipline/generated/tsconfig.paths.json")).toBe(false);
});
