import { expect, test } from "bun:test";

import { runCli } from "../../src/cli.js";
import { builtCliPath, ensureBuiltCli, runCommand, tempProject, writeFile } from "./helpers.js";

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

test("gate blocks the child command when discipline violations exist", () => {
  const projectRoot = tempProject();
  ensureBuiltCli();

  writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");
  writeFile(projectRoot, "tb.code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    maxFileLines: { max: 2 },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = runCommand("node", [
    builtCliPath,
    "gate",
    "--",
    "node",
    "-e",
    "process.stdout.write('started\\n')",
  ], {
    cwd: projectRoot,
  });

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("Found 1 discipline violation(s).");
  expect(result.stdout).not.toContain("started");
});

test("gate runs the child command when discipline passes", () => {
  const projectRoot = tempProject();
  ensureBuiltCli();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");
  writeFile(projectRoot, "tb.code-discipline.ts", [
    "export default {",
    "  rules: {",
    "    maxFileLines: { max: 20 },",
    "  },",
    "};",
    "",
  ].join("\n"));

  const result = runCommand("node", [
    builtCliPath,
    "gate",
    "--",
    "node",
    "-e",
    "process.stdout.write('started\\n')",
  ], {
    cwd: projectRoot,
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain("started");
  expect(result.stdout).not.toContain("Found 1 discipline violation(s).");
});

test("gate fails clearly when the child command is missing", async () => {
  const projectRoot = tempProject();
  const stderr: string[] = [];

  writeFile(projectRoot, "tb.code-discipline.ts", "export default { rules: {} };\n");

  const result = await runCli(["gate"], {
    cwd: projectRoot,
    stderr: (text) => stderr.push(text),
  });

  expect(result.exitCode).toBe(1);
  expect(stderr.join("")).toContain("Missing child command after --");
});
