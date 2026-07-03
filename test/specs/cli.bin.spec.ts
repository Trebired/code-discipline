import fs from "node:fs";
import path from "node:path";

import { expect, test } from "bun:test";

import { builtCliPath, ensureBuiltCli, runCommand, tempProject, writeErroringCliFixture } from "./helpers.js";

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
