import { expect, test } from "bun:test";

import { checkCodeDiscipline, fixCodeDiscipline } from "../../src/index.js";
import { runCli } from "../../src/cli.js";
import { readFile, tempProject, writeFile } from "./helpers.js";

function writePrettierConfig(projectRoot: string): void {
  writeFile(projectRoot, "code-discipline.ts", [
    "export default {",
    "  sourceRoot: '.',",
    "  formatters: {",
    "    prettier: {",
    "      targets: ['src'],",
    "      ignore: ['ignored'],",
    "      options: {",
    "        parser: 'typescript',",
    "        printWidth: 80,",
    "        semi: true,",
    "        singleQuote: true,",
    "      },",
    "    },",
    "  },",
    "};",
    "",
  ].join("\n"));
}

test("check prettier reports files that need formatting", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "const value={message:\"hello\"}\n");

  const result = await checkCodeDiscipline({
    projectRoot,
    sourceRoot: ".",
    onlyRules: ["prettier"],
    formatters: {
      prettier: {
        targets: ["."],
        options: {
          parser: "typescript",
          semi: true,
          singleQuote: true,
        },
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: "prettier",
      filePath: "src/app.ts",
      message: "needs formatting",
    }),
  ]);
});

test("fix prettier formats configured targets and honors ignore patterns", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "const value={message:\"hello\"}\n");
  writeFile(projectRoot, "src/ignored/app.ts", "const value={message:\"ignored\"}\n");

  const result = await fixCodeDiscipline({
    projectRoot,
    sourceRoot: ".",
    onlyRules: ["prettier"],
    formatters: {
      prettier: {
        targets: ["."],
        ignore: ["ignored"],
        options: {
          parser: "typescript",
          semi: true,
          singleQuote: true,
        },
      },
    },
  });

  expect(result.ok).toBe(true);
  expect(result.formatted_files).toBe(1);
  expect(result.unchanged_files).toBe(0);
  expect(readFile(projectRoot, "src/app.ts")).toBe("const value = { message: 'hello' };\n");
  expect(readFile(projectRoot, "src/ignored/app.ts")).toBe("const value={message:\"ignored\"}\n");
});

test("plain fix runs prettier after configured structural fixes", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "// remove\nconst value={message:\"hello\"}\n");

  const result = await fixCodeDiscipline({
    projectRoot,
    sourceRoot: ".",
    formatters: {
      prettier: {
        targets: ["."],
        options: {
          parser: "typescript",
          semi: true,
          singleQuote: true,
        },
      },
    },
    rules: {
      removeComments: {},
    },
  });

  expect(result.ok).toBe(true);
  expect(result.removed_comments).toBe(1);
  expect(result.formatted_files).toBe(1);
  expect(readFile(projectRoot, "src/app.ts")).toBe("const value = { message: 'hello' };\n");
});

test("cli supports check prettier and fix prettier selectors", async () => {
  const projectRoot = tempProject();
  const checkOutput: string[] = [];
  const fixOutput: string[] = [];

  writeFile(projectRoot, "src/app.ts", "const value={message:\"hello\"}\n");
  writePrettierConfig(projectRoot);

  const checkResult = await runCli(["check", "prettier"], {
    cwd: projectRoot,
    stdout: (text) => checkOutput.push(text),
  });

  expect(checkResult.exitCode).toBe(1);
  expect(checkOutput.join("")).toContain("prettier src/app.ts needs formatting");

  const fixResult = await runCli(["fix", "prettier"], {
    cwd: projectRoot,
    stdout: (text) => fixOutput.push(text),
  });

  expect(fixResult.exitCode).toBe(0);
  expect(fixOutput.join("")).toContain("formatted files 1, unchanged files 0");
  expect(readFile(projectRoot, "src/app.ts")).toBe("const value = { message: 'hello' };\n");
});
