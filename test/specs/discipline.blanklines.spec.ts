import { expect, test } from "bun:test";

import { checkCodeDiscipline } from "#co5e63fhc1wb";
import { fixAndRead, readFile, tempProject, writeFile } from "./helpers.js";

test("inserts a blank line after imports before the first non-import statement", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", 'import x from "x";\nconst z = 1;\n');

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe('import x from "x";\n\nconst z = 1;\n');
});

test("inserts a blank line between a variable group and a function", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "const a = 1;\nconst b = 2;\nfunction run() {}\n");

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe("const a = 1;\nconst b = 2;\n\nfunction run() {}\n");
});

test("inserts blank lines between functions", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\nfunction b() {}\n");

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe("function a() {}\n\nfunction b() {}\n");
});

test("inserts blank lines between a class and a function", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "class A {}\nfunction run() {}\n");

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe("class A {}\n\nfunction run() {}\n");
});

test("keeps adjacent imports compact", async () => {
  const projectRoot = tempProject();
  const source = 'import a from "a";\nimport b from "b";\nimport c from "c";\n\nconst noop = 1;\n';
  writeFile(projectRoot, "src/app.ts", source);

  const result = await checkCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });

  expect(result.ok).toBe(true);
  expect(result.violations).toEqual([]);
  expect(readFile(projectRoot, "src/app.ts")).toBe(source);
});

test("keeps adjacent variables compact", async () => {
  const projectRoot = tempProject();
  const source = "const a = 1;\nconst b = 2;\nlet c = 3;\n\nfunction run() {}\n";
  writeFile(projectRoot, "src/app.ts", source);

  const result = await checkCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });

  expect(result.ok).toBe(true);
});

test("keeps adjacent type declarations compact", async () => {
  const projectRoot = tempProject();
  const source = "type UserId = string;\ntype OrganizationId = string;\ninterface UserRecord {\n  id: UserId;\n}\n\nconst noop = 1;\n";
  writeFile(projectRoot, "src/app.ts", source);

  const result = await checkCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });

  expect(result.ok).toBe(true);
});

test("preserves one intentional blank line inside a compact group", async () => {
  const projectRoot = tempProject();
  const source = 'import fs from "node:fs";\n\nimport ts from "typescript";\n\nconst noop = 1;\n';
  writeFile(projectRoot, "src/app.ts", source);

  const result = await checkCodeDiscipline({ projectRoot, rules: { structuralBlankLines: {} } });

  expect(result.ok).toBe(true);
  expect(readFile(projectRoot, "src/app.ts")).toBe(source);
});

test("collapses two or more blank lines to one", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", "function a() {}\n\n\n\nfunction b() {}\n");

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe("function a() {}\n\nfunction b() {}\n");
});

test("handles @ts-nocheck file headers", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", '// @ts-nocheck\nimport x from "x";\n');

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe('// @ts-nocheck\n\nimport x from "x";\n');
});

test("handles shebangs", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/cli.ts", '#!/usr/bin/env node\nimport x from "x";\n');

  const result = await fixAndRead(projectRoot, "src/cli.ts", { structuralBlankLines: {} });

  expect(result).toBe('#!/usr/bin/env node\n\nimport x from "x";\n');
});

test("handles JSDoc attached to a declaration", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", [
    "const timeout = 1000;",
    "/**",
    " * Starts the server.",
    " */",
    "function startServer() {}",
    "",
  ].join("\n"));

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe([
    "const timeout = 1000;",
    "",
    "/**",
    " * Starts the server.",
    " */",
    "function startServer() {}",
    "",
  ].join("\n"));
});

test("handles decorators", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", [
    "const registry = new Registry();",
    "@Injectable()",
    "class UserService {}",
    "",
  ].join("\n"));

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe([
    "const registry = new Registry();",
    "",
    "@Injectable()",
    "class UserService {}",
    "",
  ].join("\n"));
});

test("handles function overloads as one logical group", async () => {
  const projectRoot = tempProject();
  writeFile(projectRoot, "src/app.ts", [
    "function read(value: string): string;",
    "function read(value: Buffer): string;",
    "function read(value: string | Buffer): string {",
    "  return String(value);",
    "}",
    "function other() {}",
    "",
  ].join("\n"));

  const result = await fixAndRead(projectRoot, "src/app.ts", { structuralBlankLines: {} });

  expect(result).toBe([
    "function read(value: string): string;",
    "function read(value: Buffer): string;",
    "function read(value: string | Buffer): string {",
    "  return String(value);",
    "}",
    "",
    "function other() {}",
    "",
  ].join("\n"));
});
