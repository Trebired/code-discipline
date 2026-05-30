import { describe, expect, test } from "bun:test";

import { runCli } from "../../src/cli.js";
import { fileExists, readFile, tempProject, writeFile } from "./helpers.js";

describe("code-discipline cli", () => {
  test("runs check through discovered config and exits non-zero for stop=true violations", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];
    const stderr: string[] = [];

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "code-discipline.config.json", JSON.stringify({
      rules: {
        maxFileLines: {
          enabled: true,
          stop: true,
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
    expect(stdout.join("")).toContain("FAIL max-file-lines src/too-long.ts");
  });

  test("runs sync through config and mutates only when syncImports.fix is true", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");
    writeFile(projectRoot, "code-discipline.config.json", JSON.stringify({
      rules: {
        syncImports: {
          enabled: true,
          stop: true,
          fix: true,
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    }, null, 2));

    const result = await runCli(["sync"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
    expect(stdout.join("")).toContain("\"mutations_allowed\":true");
  });

  test("runs fix through config and applies folderization moves", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");
    writeFile(projectRoot, "src/app.ts", 'export { route } from "./api/user_route";\nexport { schema } from "./api/user_schema";\n');
    writeFile(projectRoot, "code-discipline.config.json", JSON.stringify({
      rules: {
        folderizeCompoundFiles: {
          enabled: true,
          stop: true,
          fix: true,
        },
      },
    }, null, 2));

    const result = await runCli(["fix"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(true);
    expect(readFile(projectRoot, "src/app.ts")).toContain('from "./api/user/route"');
    expect(stdout.join("")).toContain("\"moved_files\":2");
  });
});
