import { describe, expect, test } from "bun:test";

import { runCli } from "../../src/cli.js";
import { readFile, tempProject, writeFile } from "./helpers.js";

describe("code-discipline cli", () => {
  test("runs check through the CLI using discovered config", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];
    const stderr: string[] = [];

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "code-discipline.config.json", JSON.stringify({
      rules: {
        maxFileLines: {
          enabled: true,
          max: 2,
        },
      },
    }, null, 2));

    const result = await runCli(["check"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("ERROR max-file-lines src/too-long.ts");
  });

  test("runs sync through the CLI using config overrides", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");
    writeFile(projectRoot, "code-discipline.config.json", JSON.stringify({
      rules: {
        syncImports: {
          alias: {
            strategy: "relative-path-slug",
          },
        },
      },
    }, null, 2));

    const result = await runCli(["sync"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
    expect(stdout.join("")).toContain("\"rewritten_imports\":1");
  });
});
