import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { codeDiscipline } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function createLanguageProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-language-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "tool.py"), pythonSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "run.sh"), shellSource(), "utf8");
  return root;
}

function pythonSource() {
  return [
    "#!/usr/bin/env python3",
    "# coding: utf-8",
    "VALUE = '# keep literal'",
    "# remove python comment",
    "def build_value():",
    "    text = '''# keep triple string",
    "def not_real():",
    "    pass",
    "'''",
    "    one = VALUE",
    "    two = text",
    "    return one + two  # remove inline python comment",
    "",
  ].join("\n");
}

function shellSource() {
  return [
    "#!/usr/bin/env sh",
    "name='value # keep literal'",
    "cat <<EOF",
    "# keep heredoc text",
    "EOF",
    "# remove shell comment",
    "do_work() {",
    "  echo \"$name\"",
    "  echo two # remove inline shell comment",
    "  echo three",
    "}",
    "",
  ].join("\n");
}

function options(projectRoot, mode, onlyRules) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules,
    rules: {
      maxFunctionLines: { max: 3 },
      removeComments: {},
    },
  };
}

async function verifyLanguageCheck(projectRoot) {
  const result = await codeDiscipline(options(projectRoot, "check", ["max-function-lines", "remove-comments"]));
  const files = result.violations.map((violation) => violation.filePath).sort();
  assert.ok(files.includes("src/tool.py"));
  assert.ok(files.includes("src/run.sh"));
  assert.ok(result.violations.some((violation) => violation.message.includes("build_value")));
  assert.ok(result.violations.some((violation) => violation.message.includes("do_work")));
  assert.equal(result.violations.some((violation) => violation.message.includes("not_real")), false);
}

async function verifyLanguageFix(projectRoot) {
  await codeDiscipline(options(projectRoot, "fix", ["remove-comments"]));
  const python = await fs.readFile(path.join(projectRoot, "src", "tool.py"), "utf8");
  const shell = await fs.readFile(path.join(projectRoot, "src", "run.sh"), "utf8");
  assert.ok(python.includes("#!/usr/bin/env python3"));
  assert.ok(python.includes("# coding: utf-8"));
  assert.ok(python.includes("'# keep literal'"));
  assert.ok(python.includes("# keep triple string"));
  assert.equal(python.includes("remove python comment"), false);
  assert.ok(shell.includes("#!/usr/bin/env sh"));
  assert.ok(shell.includes("value # keep literal"));
  assert.ok(shell.includes("# keep heredoc text"));
  assert.equal(shell.includes("remove shell comment"), false);
}

const projectRoot = await createLanguageProject();
await verifyLanguageCheck(projectRoot);
await verifyLanguageFix(projectRoot);

console.log("language support verification passed");
