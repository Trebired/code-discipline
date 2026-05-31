import { describe, expect, test } from "bun:test";

import { runCli } from "../../src/cli.js";
import { fileExists, readFile, tempProject, writeFile } from "./helpers.js";

describe("code-discipline cli", () => {
  test("requires an explicit config module path", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = await runCli(["check"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("Missing required --config <path> option");
  });

  test("runs check through an explicit config module and exits zero for warnings only", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];
    const stderr: string[] = [];

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "discipline.config.mjs", [
      "export default {",
      "  rules: {",
      "    maxFileLines: {",
      "      severity: \"warning\",",
      "      max: 2,",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["check", "--config", "./discipline.config.mjs"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("WARNING max-file-lines src/too-long.ts");
    expect(stdout.join("")).toContain("Summary: 0 errors, 1 warnings.");
  });

  test("runs check through an explicit config module and exits non-zero for errors", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "discipline.config.mjs", [
      "export default {",
      "  rules: {",
      "    maxFileLines: {",
      "      severity: \"error\",",
      "      max: 2,",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["check", "--config", "./discipline.config.mjs"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stdout.join("")).toContain("ERROR max-file-lines src/too-long.ts");
  });

  test("runs sync through an explicit config module and mutates only when syncImports.fix is true", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");
    writeFile(projectRoot, "discipline.config.mjs", [
      "export default {",
      "  rules: {",
      "    syncImports: {",
      "      severity: \"error\",",
      "      fix: true,",
      "      alias: { strategy: \"relative-path-slug\" },",
      "      allowRelative: [\"./\"],",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["sync", "--config", "./discipline.config.mjs"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
    expect(stdout.join("")).toContain("\"mutations_allowed\":true");
  });

  test("runs fix through an explicit config module and applies folderization moves", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "src/api/user_route.ts", "export const route = true;\n");
    writeFile(projectRoot, "src/api/user_schema.ts", "export const schema = true;\n");
    writeFile(projectRoot, "src/app.ts", 'export { route } from "./api/user_route";\nexport { schema } from "./api/user_schema";\n');
    writeFile(projectRoot, "discipline.config.mjs", [
      "export default {",
      "  rules: {",
      "    folderizeCompoundFiles: {",
      "      severity: \"error\",",
      "      fix: true,",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["fix", "--config", "./discipline.config.mjs"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(fileExists(projectRoot, "src/api/user/route.ts")).toBe(true);
    expect(readFile(projectRoot, "src/app.ts")).toContain('from "./api/user/route"');
    expect(stdout.join("")).toContain("\"moved_files\":2");
  });
});
