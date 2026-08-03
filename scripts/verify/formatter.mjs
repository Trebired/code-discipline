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

async function writeLongLineFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/message.ts", text: [
    "export const message = \"The formatter splits this TypeScript string while preserving the runtime value.\"",
    "",
  ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/LongLine.qml", text: [
    "Item {",
    "function center() { const field = selectedField(); if (!field) return; updateGeometry(selectedFieldIndex, widthValue / 2, heightValue / 2, false); fieldsModel.setProperty(selectedFieldIndex, \"alignment\", \"center\") }",
    "Controls.Label {",
    "text: \"The formatter splits this QML label without changing the JavaScript string value.\"",
    "}",
    "}",
    "",
  ].join("\n") });
  await writeFixtureFile({ root, relativePath: "src/raw.rs", text: [
    "pub fn svg() -> &'static str {",
    "r#\"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"80\" height=\"50\"><rect width=\"80\" height=\"50\" fill=\"white\"/></svg>\"#",
    "}",
    "",
  ].join("\n") });
}

async function writeScriptFixtures(root) {
  await writeFixtureFile({ root, relativePath: "src/tool.py", text: [
    "#!/usr/bin/env python3",
    "def run():   ",
    "    # this comment is long enough that it should wrap at a small configured width",
    "    value = \"The formatter splits this Python string while preserving the runtime value.\"",
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
  await writeLongLineFixtures(root);
  await writeScriptFixtures(root);
  await writeFixtureFile({
    root,
    relativePath: ".trebired/code-discipline/config.ts",
    text: "const value='state'   ;\n",
  });
  return root;
}

function formatterOptions(projectRoot, mode, onlyRules = ["format"]) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules,
    rules: {
      formatting: {},
      maxCharactersPerLine: {
        max: 44,
      },
    },
  };
}

function assertLinesFit(text, max, label) {
  const violations = text
    .split(/\n/u)
    .map((line, index) => ({ line, lineNumber: index + 1, count: Array.from(line).length }))
    .filter((entry) => entry.count > max);

  assert.deepEqual(violations, [], `${label} should not contain lines over ${max} characters`);
}

function assertInitialCheck(check) {
  const violatedFiles = check.violations.map((violation) => violation.filePath).sort();

  assert.equal(check.ok, false);
  assert.equal(violatedFiles.some((filePath) => filePath.startsWith(".trebired/code-discipline/")), false);
  assert.ok(violatedFiles.includes("src/app.ts"));
  assert.ok(violatedFiles.includes("src/View.qml"));
  assert.ok(violatedFiles.includes("src/styles.css"));
  assert.ok(violatedFiles.includes("src/tool.py"));
}

async function assertFormattedOutput(projectRoot) {
  assert.equal(await fs.readFile(path.join(projectRoot, "src/app.ts"), "utf8"), [
    "export function run(){",
    "  const value = {",
    "    name: \"one\"",
    "  }",
    "  return value",
    "}",
    "",
  ].join("\n"));
  const toolText = await fs.readFile(path.join(projectRoot, "src/tool.py"), "utf8");

  assert.ok(toolText.includes("    value = ("));
  assertLinesFit(toolText, 44, "src/tool.py");
  assert.equal(toolText, [
    "#!/usr/bin/env python3",
    "def run():",
    "    # this comment is long enough that it",
    "    # should wrap at a small configured",
    "    # width",
    "    value = (",
    "        \"The formatter splits this Python \"",
    "        \"string while preserving the \"",
    "        \"runtime value.\"",
    "    )",
    "    return True",
    "",
  ].join("\n"));
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/message.ts"), "utf8"), 44, "src/message.ts");
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/LongLine.qml"), "utf8"), 44, "src/LongLine.qml");
  assertLinesFit(await fs.readFile(path.join(projectRoot, "src/raw.rs"), "utf8"), 44, "src/raw.rs");
}

async function verifyFormatter() {
  const projectRoot = await createFormatterProject();
  const statePath = path.join(projectRoot, ".trebired/code-discipline/config.ts");
  const stateBefore = await fs.readFile(statePath, "utf8");
  const check = await codeDiscipline(formatterOptions(projectRoot, "check"));

  assertInitialCheck(check);

  const fix = await codeDiscipline(formatterOptions(projectRoot, "fix"));
  assert.equal(fix.ok, true);
  assert.ok(fix.formatted_files >= 4);
  assert.equal(await fs.readFile(statePath, "utf8"), stateBefore);

  const clean = await codeDiscipline(formatterOptions(projectRoot, "check", ["format", "max-characters-per-line"]));
  assert.equal(clean.ok, true, JSON.stringify(clean.violations, null, 2));
  assert.equal(clean.violationCount, 0);

  await assertFormattedOutput(projectRoot);
}

async function verifyLegacyFormatterAlias() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cd-formatter-legacy-"));
  await writeFixtureFile({
    root: projectRoot,
    relativePath: "src/app.ts",
    text: "export function run(){\nreturn true\n}\n",
  });

  const result = await codeDiscipline({
    projectRoot,
    ignore: { use_gitignore: false },
    mode: "check",
    onlyRules: ["format"],
    formatter: true,
    rules: {
      maxCharactersPerLine: {
        max: 44,
      },
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((violation) => violation.rule === "format"));
}

await verifyFormatter();
await verifyLegacyFormatterAlias();

console.log("formatter verification passed");
