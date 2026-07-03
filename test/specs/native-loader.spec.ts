import { describe, expect, test } from "bun:test";

import {
  activeNativeBackendNotice,
  checkCodeDiscipline,
  nativeAddonCandidatePathsForCurrentPlatform,
  nativeBinaryBasenameForCurrentPlatform,
  resetNativeBindingForTests,
} from "../../src/index.js";
import { stripComments, stripCommentsJs } from "../../src/checks/rules/comment-stripping.js";
import { scanSourceFiles } from "../../src/imports/scan.js";
import { tempProject, writeFile } from "./helpers.js";

describe("code-discipline native backend", () => {
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

  test("disables native loading only when TB_CODE_DISCIPLINE_DISABLE_NATIVE=1", () => {
    const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;

    try {
      process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
      resetNativeBindingForTests();
      expect(activeNativeBackendNotice()).toBe("@trebired/code-discipline using TS fallback backend");
    } finally {
      if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
      resetNativeBindingForTests();
    }
  });

  test("native and TS comment stripping agree when native is available", () => {
    const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
    const source = [
      'const url = "https://example.com";',
      'const regex = /https?:\\/\\/example\\.com/;',
      "// remove this",
      "/* and this */",
      "export const app = { url, regex };",
      "",
    ].join("\n");

    try {
      delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      resetNativeBindingForTests();
      const nativeResult = stripComments(source, ".ts");
      const jsResult = stripCommentsJs(source, ".ts");
      expect(nativeResult).toEqual(jsResult);
    } finally {
      if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
      resetNativeBindingForTests();
    }
  });

  test("native and TS source scanning agree when native is available", async () => {
    const projectRoot = tempProject();
    const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;

    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
    writeFile(projectRoot, "src/nested/service.go", "package demo\n");
    writeFile(projectRoot, "src/generated/skip.ts", "export const skip = true;\n");

    const options = {
      projectRoot,
      sourceRoot: `${projectRoot}/src`,
      sourceExtensions: [".ts", ".go"],
      excludeDirs: ["generated"],
      excludeGitignoreDirs: false,
      gitignorePath: `${projectRoot}/.gitignore`,
    };

    try {
      delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      resetNativeBindingForTests();
      const nativeResult = await scanSourceFiles(options);

      process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
      resetNativeBindingForTests();
      const fallbackResult = await scanSourceFiles(options);

      expect(nativeResult).toEqual(fallbackResult);
    } finally {
      if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
      resetNativeBindingForTests();
    }
  });

  test("native and TS max-file-lines results agree", async () => {
    const projectRoot = tempProject();
    const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

    try {
      delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      resetNativeBindingForTests();
      const nativeResult = await checkCodeDiscipline({
        projectRoot,
        rules: {
          maxFileLines: {
            max: 2,
          },
        },
      });

      process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
      resetNativeBindingForTests();
      const fallbackResult = await checkCodeDiscipline({
        projectRoot,
        rules: {
          maxFileLines: {
            max: 2,
          },
        },
      });

      expect(nativeResult).toEqual(fallbackResult);
    } finally {
      if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
      resetNativeBindingForTests();
    }
  });

  test("native and TS evasion guard results agree", async () => {
    const projectRoot = tempProject();
    const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;

    writeFile(projectRoot, "src/checkout.ts", "export function checkout(cart) { const total = cart.items.reduce((sum, item) => sum + item.price, 0); if (!cart.user) throw new Error(\"login\"); const tax = total * 0.2; const discount = cart.coupon ? total * 0.1 : 0; return total + tax - discount; }\n");
    writeFile(projectRoot, "src/runtime.ts", "export const patch = new Function(\"db\", \"db.users.deleteMany({ role: 'test' })\");\n");

    try {
      delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      resetNativeBindingForTests();
      const nativeResult = await checkCodeDiscipline({
        projectRoot,
        evasionGuards: true,
        onlyRules: ["evasion-guards"],
      });

      process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
      resetNativeBindingForTests();
      const fallbackResult = await checkCodeDiscipline({
        projectRoot,
        evasionGuards: true,
        onlyRules: ["evasion-guards"],
      });

      expect(nativeResult.ok).toBe(fallbackResult.ok);
      expect(nativeResult.violations.map((violation) => violation.details.kind)).toEqual(expect.arrayContaining(
        fallbackResult.violations.map((violation) => violation.details.kind),
      ));
    } finally {
      if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
      resetNativeBindingForTests();
    }
  });

  test("native and TS folderize results agree", async () => {
    const projectRoot = tempProject();
    const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;

    writeFile(projectRoot, "src/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/user_model.ts", "export const model = true;\n");

    try {
      delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      resetNativeBindingForTests();
      const nativeResult = await checkCodeDiscipline({
        projectRoot,
        rules: {
          folderizeCompoundFiles: {
            separators: ["_"],
          },
        },
      });

      process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
      resetNativeBindingForTests();
      const fallbackResult = await checkCodeDiscipline({
        projectRoot,
        rules: {
          folderizeCompoundFiles: {
            separators: ["_"],
          },
        },
      });

      expect(nativeResult).toEqual(fallbackResult);
    } finally {
      if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
      resetNativeBindingForTests();
    }
  });

  test("native and TS Go/Rust max-function-lines results agree", async () => {
    const projectRoot = tempProject();
    const previousDisable = process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;

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

    try {
      delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      resetNativeBindingForTests();
      const nativeResult = await checkCodeDiscipline({
        projectRoot,
        rules: {
          maxFunctionLines: {
            max: 5,
          },
        },
      });

      process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
      resetNativeBindingForTests();
      const fallbackResult = await checkCodeDiscipline({
        projectRoot,
        rules: {
          maxFunctionLines: {
            max: 5,
          },
        },
      });

      expect(nativeResult).toEqual(fallbackResult);
    } finally {
      if (previousDisable === undefined) delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
      else process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = previousDisable;
      resetNativeBindingForTests();
    }
  });
});
