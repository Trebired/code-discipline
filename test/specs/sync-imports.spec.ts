import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

import {
  AliasCollisionError,
  createRelativePathHashAlias,
  createRelativePathSlugAlias,
  syncImports,
} from "../../src/index.js";
import { captureCallbackLogger, captureTrebiredLogger, readFile, readJson, tempProject, writeFile } from "./helpers.js";

describe("code-discipline syncImports", () => {
  test("generates aliases from an empty tsconfig", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
      imports: { rewrite: false },
    });

    const tsconfig = readJson(projectRoot, "tsconfig.json");

    expect(result).toEqual({
      aliases_changed: true,
      aliases_count: 2,
      rewritten_files: 0,
      rewritten_imports: 0,
    });
    expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();
    expect(tsconfig.compilerOptions.paths).toEqual({
      "#app": ["src/app.ts"],
      "#shared-util": ["src/shared/util.ts"],
    });
  });

  test("preserves existing valid alias ids", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        paths: {
          "#kept": ["src/shared/util.ts"],
        },
      },
    }, null, 2));
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
      imports: { rewrite: false },
    });

    const tsconfig = readJson(projectRoot, "tsconfig.json");
    expect(tsconfig.compilerOptions.paths).toEqual({
      "#app": ["src/app.ts"],
      "#kept": ["src/shared/util.ts"],
    });
  });

  test("replaces stale alias paths", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        paths: {
          "#stale": ["src/missing.ts"],
        },
      },
    }, null, 2));
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
      imports: { rewrite: false },
    });

    const tsconfig = readJson(projectRoot, "tsconfig.json");
    expect(tsconfig.compilerOptions.paths).toEqual({
      "#shared-util": ["src/shared/util.ts"],
    });
  });

  test("produces random aliases with the default format", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/example.ts", "export const value = true;\n");

    await syncImports({
      projectRoot,
      imports: { rewrite: false },
    });

    const tsconfig = readJson(projectRoot, "tsconfig.json");
    const [aliasId] = Object.keys(tsconfig.compilerOptions.paths);

    expect(aliasId).toMatch(/^#[a-z0-9]{12}$/);
  });

  test("exports stable slug and hash strategies", () => {
    expect(createRelativePathSlugAlias({
      absolutePath: "/repo/src/shared/http-client.ts",
      relativeFromProjectRoot: "src/shared/http-client.ts",
      relativeFromSourceRoot: "shared/http-client",
      existingIds: [],
      prefix: "#",
    })).toBe("#shared-http-client");

    expect(createRelativePathHashAlias({
      absolutePath: "/repo/src/shared/http-client.ts",
      relativeFromProjectRoot: "src/shared/http-client.ts",
      relativeFromSourceRoot: "shared/http-client",
      existingIds: [],
      prefix: "#",
    })).toBe(`#${createHash("sha1").update("shared/http-client").digest("hex").slice(0, 12)}`);
  });

  test("supports custom alias strategies", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    await syncImports({
      projectRoot,
      alias: {
        strategy(input) {
          return `@${input.relativeFromSourceRoot.replace(/\//g, "__")}`;
        },
      },
      imports: { rewrite: false },
    });

    const tsconfig = readJson(projectRoot, "tsconfig.json");
    expect(tsconfig.compilerOptions.paths).toEqual({
      "@shared__util": ["src/shared/util.ts"],
    });
  });

  test("fails clearly on alias collisions", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/one.ts", "export const one = true;\n");
    writeFile(projectRoot, "src/two.ts", "export const two = true;\n");

    await expect(syncImports({
      projectRoot,
      alias: {
        strategy() {
          return "#same";
        },
      },
      imports: { rewrite: false },
    })).rejects.toBeInstanceOf(AliasCollisionError);
  });

  test("keeps ./ imports relative by default", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { local } from "./local";\nimport { util } from "../shared/util";\nexport { local, util };\n');
    writeFile(projectRoot, "src/feature/local.ts", "export const local = true;\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
    });

    const source = readFile(projectRoot, "src/feature/app.ts");

    expect(result.rewritten_files).toBe(1);
    expect(result.rewritten_imports).toBe(1);
    expect(source).toContain('from "./local"');
    expect(source).toContain('from "#shared-util"');
  });

  test("supports custom keep-relative arrays", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { local } from "./local";\nimport { util } from "../shared/util";\nexport { local, util };\n');
    writeFile(projectRoot, "src/feature/local.ts", "export const local = true;\n");
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
      imports: {
        keepRelative: ["./", "../shared"],
      },
    });

    const source = readFile(projectRoot, "src/feature/app.ts");

    expect(result.rewritten_files).toBe(0);
    expect(result.rewritten_imports).toBe(0);
    expect(source).toContain('from "./local"');
    expect(source).toContain('from "../shared/util"');
  });

  test("supports custom keep-relative callbacks", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const result = await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
      imports: {
        keepRelative(specifier, context) {
          return specifier === "../shared/util" && context.resolvedFile.endsWith("/src/shared/util.ts");
        },
      },
    });

    expect(result.rewritten_files).toBe(0);
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "../shared/util"');
  });

  test("rewrites imports, exports, dynamic imports, and import types", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", [
      'import { util } from "../shared/util";',
      'export { other } from "../shared/other";',
      'const loader = () => import("../shared/dynamic");',
      'type SharedType = import("../shared/types").SharedType;',
      "export { util, loader };",
      "export type { SharedType };",
      "",
    ].join("\n"));
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");
    writeFile(projectRoot, "src/shared/other.ts", "export const other = true;\n");
    writeFile(projectRoot, "src/shared/dynamic.ts", "export const dynamic = true;\n");
    writeFile(projectRoot, "src/shared/types.ts", "export type SharedType = { ok: true };\n");

    const result = await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
    });

    const source = readFile(projectRoot, "src/feature/app.ts");

    expect(result.rewritten_files).toBe(1);
    expect(result.rewritten_imports).toBe(4);
    expect(source).toContain('from "#shared-util"');
    expect(source).toContain('from "#shared-other"');
    expect(source).toContain('import("#shared-dynamic")');
    expect(source).toContain('import("#shared-types").SharedType');
  });

  test("skips unresolved imports", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/app.ts", 'import { missing } from "./missing";\nexport { missing };\n');

    const result = await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
    });

    expect(result.rewritten_files).toBe(0);
    expect(result.rewritten_imports).toBe(0);
    expect(readFile(projectRoot, "src/app.ts")).toContain('from "./missing"');
  });

  test("skips imports that resolve outside the source root", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/app.ts", 'import { client } from "../generated/client";\nexport { client };\n');
    writeFile(projectRoot, "generated/client.ts", "export const client = true;\n");

    const result = await syncImports({
      projectRoot,
      alias: { strategy: "relative-path-slug" },
    });

    expect(result.rewritten_files).toBe(0);
    expect(result.rewritten_imports).toBe(0);
    expect(readFile(projectRoot, "src/app.ts")).toContain('from "../generated/client"');
  });

  test("logs through Trebired-style loggers", async () => {
    const projectRoot = tempProject();
    const { logger, rows } = captureTrebiredLogger();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    await syncImports({
      projectRoot,
      imports: { rewrite: false },
      logging: {
        enabled: true,
        logger,
      },
    });

    expect(rows.some((row) => row.method === "info" && row.message === "sync started")).toBe(true);
    expect(rows.some((row) => row.method === "success" && row.message.startsWith("aliases written"))).toBe(true);
    expect(rows.every((row) => row.group === "code-discipline")).toBe(true);
  });

  test("logs through callback adapters", async () => {
    const projectRoot = tempProject();
    const { adapter, rows } = captureCallbackLogger();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    await syncImports({
      projectRoot,
      imports: { rewrite: false },
      logging: {
        enabled: true,
        adapter,
      },
    });

    expect(rows.map((row) => row.event)).toEqual([
      "sync-started",
      "aliases-written",
      "sync-finished",
    ]);
  });

  test("returns stable result counts across repeated runs", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const first = await syncImports({
      projectRoot,
    });

    const second = await syncImports({
      projectRoot,
    });

    expect(first.aliases_changed).toBe(true);
    expect(first.aliases_count).toBe(2);
    expect(first.rewritten_files).toBe(1);
    expect(first.rewritten_imports).toBe(1);
    expect(second).toEqual({
      aliases_changed: false,
      aliases_count: 2,
      rewritten_files: 0,
      rewritten_imports: 0,
    });
  });
});
