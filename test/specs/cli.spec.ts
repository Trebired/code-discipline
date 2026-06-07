import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { runCli } from "../../src/cli.js";
import { fileExists, readFile, runCommand, tempProject, writeFile } from "./helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const builtCliPath = path.join(packageRoot, "dist", "cli.js");
let builtCliReady = false;

function ensureBuiltCli() {
  if (builtCliReady && fs.existsSync(builtCliPath)) {
    return;
  }

  const result = runCommand("bun", ["run", "build"], {
    cwd: packageRoot,
  });

  if (result.status !== 0) {
    throw new Error(`build failed: ${result.stderr || result.stdout}`);
  }

  builtCliReady = true;
}

function writeErroringCliFixture(projectRoot: string) {
  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
  writeFile(projectRoot, "tb.code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    maxFileLines: {",
    "      max: 2,",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));
}

describe("code-discipline cli", () => {
  test("auto-discovers a config module for plain cli usage", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];
    const stderr: string[] = [];

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "tb.code-discipline.ts", [
      "export default {",
      "  rules: {",
      "    maxFileLines: {",
      "      max: 2,",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["check"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("Found 1 discipline violation(s).");
  });

  test("runs check through an explicit config module and exits non-zero when violations exist", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];
    const stderr: string[] = [];

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "discipline.config.mjs", [
      "export default {",
      "  rules: {",
      "    maxFileLines: {",
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

    expect(result.exitCode).toBe(1);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("Found 1 discipline violation(s).");
  });

  test("runs check through an explicit config module and prints concise violations", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "discipline.config.mjs", [
      "export default {",
      "  rules: {",
      "    maxFileLines: {",
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
    expect(stdout.join("")).toContain("max-file-lines src/too-long.ts");
    expect(stdout.join("")).toContain("Found 1 discipline violation(s).");
  });

  test("runs fix sync-imports through an explicit config module", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");
    writeFile(projectRoot, "discipline.config.mjs", [
      "export default {",
      "  rules: {",
      "    syncImports: {",
      "      alias: { strategy: \"relative-path-slug\" },",
      "      allowRelative: [\"./\"],",
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["fix", "sync-imports", "--config", "./discipline.config.mjs"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
    expect(stdout.join("")).toContain("Fix summary: moved 0, rewritten files 1, rewritten imports 1, remaining violations 0.");
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
      "    folderizeCompoundFiles: {},",
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
    expect(stdout.join("")).toContain("Fix summary: moved 2, rewritten files 1, rewritten imports 2, remaining violations 0.");
  });

  test("saves check output to a top-level report file", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];
    const reportName = "cd-report-2026-05-26-19-00-00.txt";

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
    writeFile(projectRoot, "tb.code-discipline.ts", [
      "export default {",
      "  rules: {",
      "    maxFileLines: { max: 2 },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["check", "save"], {
      cwd: projectRoot,
      now: new Date("2026-05-26T19:00:00"),
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(fileExists(projectRoot, reportName)).toBe(true);
    expect(readFile(projectRoot, reportName)).toContain("Found 1 discipline violation(s).");
    expect(stdout.join("")).toContain(`Saved report to ${reportName}.`);
  });

  test("prints a clear error when no config module can be found", async () => {
    const projectRoot = tempProject();
    const stderr: string[] = [];

    const result = await runCli(["check"], {
      cwd: projectRoot,
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("No code-discipline config module was found");
  });

  test("executes correctly when the built cli file is invoked directly", () => {
    const projectRoot = tempProject();
    ensureBuiltCli();
    writeErroringCliFixture(projectRoot);

    const result = runCommand("node", [builtCliPath, "check"], {
      cwd: projectRoot,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Found 1 discipline violation(s).");
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  test("executes correctly through a symlinked bin path instead of silently no-oping", () => {
    const projectRoot = tempProject();
    ensureBuiltCli();
    writeErroringCliFixture(projectRoot);

    const binDir = path.join(projectRoot, "node_modules", ".bin");
    const symlinkPath = path.join(binDir, "code-discipline");
    fs.mkdirSync(binDir, { recursive: true });
    fs.symlinkSync(builtCliPath, symlinkPath);

    const result = runCommand("node", [symlinkPath, "check"], {
      cwd: projectRoot,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Found 1 discipline violation(s).");
    expect(result.stdout).not.toBe("");
  });

  test("executes correctly through bun with a symlinked bin path", () => {
    const projectRoot = tempProject();
    ensureBuiltCli();
    writeErroringCliFixture(projectRoot);

    const binDir = path.join(projectRoot, "node_modules", ".bin");
    const symlinkPath = path.join(binDir, "code-discipline");
    fs.mkdirSync(binDir, { recursive: true });
    fs.symlinkSync(builtCliPath, symlinkPath);

    const result = runCommand("bun", [symlinkPath, "check"], {
      cwd: projectRoot,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Found 1 discipline violation(s).");
    expect(result.stdout).not.toBe("");
  });

  test("rejects the removed sync command", async () => {
    const projectRoot = tempProject();
    const stderr: string[] = [];

    writeFile(projectRoot, "tb.code-discipline.ts", "export default { rules: {} };\n");

    const result = await runCli(["sync"], {
      cwd: projectRoot,
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("Unknown command: sync");
  });

  test("narrows check to a selected rule slug", async () => {
    const projectRoot = tempProject();
    const stdout: string[] = [];

    writeFile(projectRoot, "src/functions.ts", [
      "export const longThing = () => {",
      "  const a = 1;",
      "  const b = 2;",
      "  const c = 3;",
      "  return a + b + c;",
      "};",
      "",
    ].join("\n"));
    writeFile(projectRoot, "tb.code-discipline.ts", [
      "export default {",
      "  rules: {",
      "    maxFileLines: { max: 100 },",
      "    maxFunctionLines: { max: 3 },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["check", "max-function-lines"], {
      cwd: projectRoot,
      stdout: (text) => stdout.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stdout.join("")).toContain("Found 1 discipline violation(s).");
  });

  test("fails clearly when fix targets a non-fixable rule", async () => {
    const projectRoot = tempProject();
    const stderr: string[] = [];

    writeFile(projectRoot, "src/functions.ts", "export const longThing = () => {\n  return 1;\n};\n");
    writeFile(projectRoot, "tb.code-discipline.ts", [
      "export default {",
      "  rules: {",
      "    maxFunctionLines: { max: 1 },",
      "  },",
      "};",
      "",
    ].join("\n"));

    const result = await runCli(["fix", "max-function-lines"], {
      cwd: projectRoot,
      stderr: (text) => stderr.push(text),
    });

    expect(result.exitCode).toBe(1);
    expect(stderr.join("")).toContain("Selected rule is not fixable: max-function-lines");
  });
});
