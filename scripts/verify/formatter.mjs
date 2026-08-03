import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
delete process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE;
const { codeDiscipline } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function writeFixtureFile(args) {
  const destination = path.join(args.root, args.relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, args.text, "utf8");
}

async function writeBraceFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/app.ts", text: [
    "export function run(){",
    "const value = {",
    "name: \"one\"",
    "}",
    "return value",
    "}",
    "",
    "",
  ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/View.qml", text: [
    "Item {",
    "MouseArea {",
    "onClicked: {",
    "console.log(\"ok\")",
    "}",
    "}",
    "}",
    "",
  ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/styles.css", text: [
    ".item {",
    "color: red;",
    "@media screen {",
    "display: block;",
    "}",
    "}",
    "",
  ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/lib.rs", text: [
    "pub fn run() {",
    "let value = 1;",
    "if value > 0 {",
    "println!(\"ok\");",
    "}",
    "}",
    "",
  ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/main.go", text: [
    "package main",
    "func main() {",
    "if true {",
    "println(\"ok\")",
    "}",
    "}",
    "",
  ].join("\n") });
}

async function writeScriptFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/tool.py", text: [
    "#!/usr/bin/env python3",
    "def run():   ",
    "    # this comment is long enough that it should wrap at a small configured width",
    "    return True",
    "",
  ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/run.sh", text: [
    "#!/usr/bin/env sh",
    "run(){",
    "  echo ok   ",
    "}",
    "",
  ].join("\n") });
}

async function createFormatterProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-formatter-"));
  await writeBraceFixtures(root);
  await writeScriptFixtures(root);
  await writeFixtureFile({
    root,
    relativePath: ".trebired/code-discipline/config.ts",
    text: "const value='state'   ;\n",
  });
  return root;
}

function formatterOptions(projectRoot, mode) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules: ["format"],
    formatters: {
      code: {
        targets: ["."],
        ignore: false,
        maxCharactersPerLine: 44,
        indentWidth: 2,
      },
    },
  };
}

async function verifyFormatter() {
  const projectRoot = await createFormatterProject();
  const statePath = path.join(projectRoot, ".trebired/code-discipline/config.ts");
  const stateBefore = await fs.readFile(statePath, "utf8");
  const check = await codeDiscipline(formatterOptions(projectRoot, "check"));
  const violatedFiles = check.violations.map((violation) => violation.filePath).sort();

  assert.equal(check.ok, false);
  assert.equal(violatedFiles.some((filePath) => filePath.startsWith(".trebired/code-discipline/")), false);
  assert.ok(violatedFiles.includes("src/app.ts"));
  assert.ok(violatedFiles.includes("src/View.qml"));
  assert.ok(violatedFiles.includes("src/styles.css"));
  assert.ok(violatedFiles.includes("src/tool.py"));

  const fix = await codeDiscipline(formatterOptions(projectRoot, "fix"));
  assert.equal(fix.ok, true);
  assert.ok(fix.formatted_files >= 4);
  assert.equal(await fs.readFile(statePath, "utf8"), stateBefore);

  const clean = await codeDiscipline(formatterOptions(projectRoot, "check"));
  assert.equal(clean.ok, true);
  assert.equal(clean.violationCount, 0);

  assert.equal(await fs.readFile(path.join(projectRoot, "src/app.ts"), "utf8"), [
    "export function run(){",
    "  const value = {",
    "    name: \"one\"",
    "  }",
    "  return value",
    "}",
    "",
  ].join("\n"));
  assert.equal(await fs.readFile(path.join(projectRoot, "src/tool.py"), "utf8"), [
    "#!/usr/bin/env python3",
    "def run():",
    "    # this comment is long enough that it",
    "    # should wrap at a small configured",
    "    # width",
    "    return True",
    "",
  ].join("\n"));
}

await verifyFormatter();

console.log("formatter verification passed");
