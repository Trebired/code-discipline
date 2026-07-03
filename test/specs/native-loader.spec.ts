import { describe, expect, test } from "bun:test";

import {
  activeNativeBackendNotice,
  nativeAddonCandidatePathsForCurrentPlatform,
  nativeBinaryBasenameForCurrentPlatform,
  resetNativeBindingForTests,
} from "../../src/index.js";
import { stripComments, stripCommentsJs } from "../../src/checks/rules/comment-stripping.js";

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
});
