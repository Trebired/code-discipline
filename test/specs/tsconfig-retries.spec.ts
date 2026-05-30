import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, mock, spyOn, test } from "bun:test";

import { syncImports } from "../../src/index.js";
import { captureCallbackLogger, readJson, tempProject, writeFile } from "./helpers.js";

describe("code-discipline tsconfig retries", () => {
  test.serial("retries transiently broken tsconfig reads during initialization", async () => {
    const projectRoot = tempProject();
    const tsconfigPath = path.join(projectRoot, "tsconfig.json");
    const { adapter, rows } = captureCallbackLogger();

    writeFile(projectRoot, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        strict: true,
      },
    }, null, 2));
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    const originalReadFile = fs.readFile.bind(fs);
    const readFileSpy = spyOn(fs, "readFile");
    let tsconfigReads = 0;

    try {
      readFileSpy.mockImplementation(async (...args: Parameters<typeof fs.readFile>) => {
        const [filePath, encoding] = args;
        if (String(filePath) === tsconfigPath && encoding === "utf8" && tsconfigReads === 0) {
          tsconfigReads += 1;
          return "{\n  \"compilerOptions\": {\n" as Awaited<ReturnType<typeof fs.readFile>>;
        }

        return originalReadFile(...args);
      });

      await syncImports({
        projectRoot,
        alias: { strategy: "relative-path-slug" },
        imports: { rewrite: false },
        logging: {
          enabled: true,
          adapter,
        },
      });
    } finally {
      mock.restore();
    }

    const tsconfig = readJson(projectRoot, "tsconfig.json");
    expect(tsconfig.compilerOptions).toEqual({
      paths: {
        "#app": ["src/app.ts"],
      },
      strict: true,
    });
    expect(rows.map((row) => row.event)).toContain("tsconfig-read-retry");
    expect(rows.map((row) => row.event)).toContain("tsconfig-read-recovered");
  });

  test("throws when tsconfig stays broken after retries", async () => {
    const projectRoot = tempProject();
    const tsconfigPath = path.join(projectRoot, "tsconfig.json");

    writeFile(projectRoot, "tsconfig.json", "{\n");
    writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

    const originalReadFile = fs.readFile.bind(fs);
    const readFileSpy = spyOn(fs, "readFile");

    try {
      readFileSpy.mockImplementation(async (...args: Parameters<typeof fs.readFile>) => {
        const [filePath] = args;
        if (String(filePath) === tsconfigPath) {
          return "{\n" as Awaited<ReturnType<typeof fs.readFile>>;
        }

        return originalReadFile(...args);
      });

      await expect(syncImports({
        projectRoot,
        alias: { strategy: "relative-path-slug" },
        imports: { rewrite: false },
      })).rejects.toMatchObject({
        code: "parse_failure",
      });
    } finally {
      mock.restore();
    }
  });
});
