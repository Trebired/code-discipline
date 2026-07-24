import { expect, test } from "bun:test";

import {
  activeNativeBackendNotice,
  checkCodeDiscipline,
  nativeAddonCandidatePathsForCurrentPlatform,
  nativeBinaryBasenameForCurrentPlatform,
  resetNativeBindingForTests,
} from "../../src/index.js";
import { stripComments, stripCommentsJs } from "../../src/checks/rules/comments/stripping.js";
import { scanSourceFiles } from "../../src/imports/scan.js";
import { tempProject, writeFile } from "./helpers.js";

async function withNativeBackendToggle<T>(run: () => Promise<T> | T): Promise<T> {
  const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;

  try {
    return await run();
  } finally {
    if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
    else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
    resetNativeBindingForTests();
  }
}

async function runWithNativeThenFallback<T>(run: () => Promise<T> | T): Promise<{
  nativeResult: T;
  fallbackResult: T;
}> {
  return withNativeBackendToggle(async () => {
    delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
    resetNativeBindingForTests();
    const nativeResult = await run();

    process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
    resetNativeBindingForTests();
    const fallbackResult = await run();

    return { nativeResult, fallbackResult };
  });
}

test("derives a platform-specific binary name for supported runtimes", () => {
  const name = nativeBinaryBasenameForCurrentPlatform();
  if (["linux", "darwin"].includes(process.platform) && ["x64", "arm64"].includes(process.arch)) {
    expect(typeof name).toBe("string");
    expect(String(name)).toEndWith(".node");
    return;
  }
  expect(name).toBe(null);
});

test("prioritizes platform-specific native candidates before generic fallback paths", () => {
  const paths = nativeAddonCandidatePathsForCurrentPlatform();
  if (!paths.length) return;

  const specific = nativeBinaryBasenameForCurrentPlatform();
  if (specific) expect(paths[0].endsWith(specific) || paths[1]?.endsWith(specific)).toBe(true);
  expect(paths.some((item) => item.endsWith("native/index.node"))).toBe(true);
});

test("disables native loading only when TB_CODE_DISCIPLINE_DISABLE_NATIVE=1", async () => {
  await withNativeBackendToggle(() => {
    process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
    resetNativeBindingForTests();
    expect(activeNativeBackendNotice()).toBe("@trebired/code-discipline using TS fallback backend");
  });
});

test("native and TS comment stripping agree when native is available", async () => {
  const source = [
    'const url = "https://example.com";',
    'const regex = /https?:\\/\\/example\\.com/;',
    "// remove this",
    "/* and this */",
    "export const app = { url, regex };",
    "",
  ].join("\n");

  await withNativeBackendToggle(() => {
    delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
    resetNativeBindingForTests();
    const nativeResult = stripComments(source, ".ts", { exclude: ["@ts-nocheck"] });
    const jsResult = stripCommentsJs(source, ".ts", { exclude: ["@ts-nocheck"] });
    expect(nativeResult).toEqual(jsResult);
  });
});

test("native and TS source scanning agree when native is available", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
  writeFile(projectRoot, "src/nested/service.go", "package demo\n");
  writeFile(projectRoot, "src/generated/skip.ts", "export const skip = true;\n");

  const options = {
    projectRoot,
    sourceRoot: `${projectRoot}/src`,
    sourceExtensions: [".ts", ".go"],
    excludeFolders: ["generated"],
    excludeGitignoreDirs: false,
    gitignorePath: `${projectRoot}/.gitignore`,
  };

  const { nativeResult, fallbackResult } = await runWithNativeThenFallback(() => scanSourceFiles(options));

  expect(nativeResult).toEqual(fallbackResult);
});

test("native and TS max-file-lines results agree", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

  const { nativeResult, fallbackResult } = await runWithNativeThenFallback(() => checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        max: 2,
      },
    },
  }));

  expect(nativeResult).toEqual(fallbackResult);
});

test("native and TS max-characters-per-line results agree", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/long-line.ts", `export const value = "${"x".repeat(151)}";\n`);

  const { nativeResult, fallbackResult } = await runWithNativeThenFallback(() => checkCodeDiscipline({
    projectRoot,
    onlyRules: ["max-characters-per-line"],
    rules: {
      maxCharactersPerLine: {},
    },
  }));

  expect(nativeResult).toEqual(fallbackResult);
});

test("native and TS folderize results agree", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/user_route.ts", "export const route = true;\n");
  writeFile(projectRoot, "src/user_model.ts", "export const model = true;\n");

  const { nativeResult, fallbackResult } = await runWithNativeThenFallback(() => checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {
        separators: ["_"],
      },
    },
  }));

  expect(nativeResult).toEqual(fallbackResult);
});

test("native and TS Go/Rust max-function-lines results agree", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/service.go", [
    "package demo",
    "",
    "func buildPayload() string {",
    "  one := \"sam\"",
    "  two := \"admin\"",
    "  three := \"global\"",
    "  return one + two + three",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/lib.rs", [
    "pub fn build_payload() -> String {",
    "    let one = \"sam\";",
    "    let two = \"admin\";",
    "    let three = \"global\";",
    "    format!(\"{one}{two}{three}\")",
    "}",
    "",
  ].join("\n"));

  const { nativeResult, fallbackResult } = await runWithNativeThenFallback(() => checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFunctionLines: {
        max: 5,
      },
    },
  }));

  expect(nativeResult).toEqual(fallbackResult);
});
