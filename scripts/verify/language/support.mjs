import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE = "1";
const { codeDiscipline } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function createLanguageProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-language-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, ".trebired/code-discipline"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "tool.py"), pythonSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "run.sh"), shellSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "View.qml"), qmlSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "spacing.py"), pythonSpacingSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "spacing.sh"), shellSpacingSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "spacing.qml"), qmlSpacingSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "spacing.rs"), rustSpacingSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "spacing.go"), goSpacingSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "spacing.css"), cssSpacingSource(), "utf8");
  await fs.writeFile(path.join(root, "src", "state.ts"), "export const stateDir = \".trebired/code-discipline/generated\";\n", "utf8");
  await fs.writeFile(path.join(root, ".trebired/code-discipline", "config.ts"), "const token='AUTO_EXCLUDED_TOKEN'   ;\n", "utf8");
  return root;
}

async function createFolderizeProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-folderize-language-"));
  const files = [
    "src/view_logic.qml",
    "src/view_model.qml",
    "src/render_svg.rs",
    "src/render_text.rs",
    "src/task_run.sh",
    "src/task_sync.sh",
    "src/module_alpha.py",
    "src/module_beta.py",
    "src/style_base.css",
    "src/style_theme.css",
    "src/app_main.go",
    "src/app_worker.go",
  ];

  await fs.mkdir(path.join(root, "src"), { recursive: true });
  for (const file of files) {
    await fs.writeFile(path.join(root, file), "\n", "utf8");
  }

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

function qmlSource() {
  return [
    "import QtQuick",
    "",
    "Item {",
    "    property string keep: \"literal // keep\"",
    "    property var matcher: /https?:\\/\\/example/.test(keep)",
    "    // remove qml comment",
    "    function buildTitle() {",
    "        const one = keep",
    "        const two = \"/* keep block */\"",
    "        const three = matcher",
    "        return `${one} // keep template`",
    "    }",
    "    MouseArea {",
    "        onClicked: {",
    "            console.log(\"clicked // keep\")",
    "            console.log(/a\\/\\//)",
    "            console.log(\"done\") // remove inline qml comment",
    "        }",
    "    }",
    "}",
    "",
  ].join("\n");
}

function pythonSpacingSource() {
  return [
    "def one():",
    "    return 1",
    "def two():",
    "    return 2",
    "",
  ].join("\n");
}

function shellSpacingSource() {
  return [
    "one() {",
    "  echo one",
    "}",
    "two() {",
    "  echo two",
    "}",
    "",
  ].join("\n");
}

function qmlSpacingSource() {
  return [
    "QtObject {",
    "  function one() {",
    "    return 1",
    "  }",
    "  function two() {",
    "    return 2",
    "  }",
    "}",
    "",
  ].join("\n");
}

function rustSpacingSource() {
  return [
    "fn one() {",
    "    println!(\"one\");",
    "}",
    "fn two() {",
    "    println!(\"two\");",
    "}",
    "",
  ].join("\n");
}

function goSpacingSource() {
  return [
    "package main",
    "func one() {",
    "println(\"one\")",
    "}",
    "func two() {",
    "println(\"two\")",
    "}",
    "",
  ].join("\n");
}

function cssSpacingSource() {
  return [
    ".one {",
    "  color: red;",
    "}",
    ".two {",
    "  color: blue;",
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

function structuralOptions(projectRoot, mode) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules: ["structural-blank-lines"],
    rules: {
      structuralBlankLines: {},
    },
  };
}

function folderizeOptions(projectRoot, mode) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules: ["folderize-compound-files"],
    rules: {
      folderizeCompoundFiles: {},
    },
  };
}

async function verifyLanguageCheck(projectRoot) {
  const result = await codeDiscipline(options(projectRoot, "check", ["max-function-lines", "remove-comments"]));
  const files = result.violations.map((violation) => violation.filePath).sort();
  assert.equal(result.violations.some((violation) => violation.filePath.startsWith(".trebired/code-discipline/")), false);
  assert.ok(files.includes("src/tool.py"));
  assert.ok(files.includes("src/run.sh"));
  assert.ok(files.includes("src/View.qml"));
  assert.ok(result.violations.some((violation) => violation.message.includes("build_value")));
  assert.ok(result.violations.some((violation) => violation.message.includes("do_work")));
  assert.ok(result.violations.some((violation) => violation.message.includes("buildTitle")));
  assert.ok(result.violations.some((violation) => violation.message.includes("onClicked")));
  assert.equal(result.violations.some((violation) => violation.message.includes("not_real")), false);
}

async function verifyPackageStateExclusion(projectRoot) {
  const packageStatePattern = ["tre", "bired"].join(process.env.CD_VERIFY_PATTERN_SEPARATOR ?? "");
  const result = await codeDiscipline({
    projectRoot,
    ignore: { use_gitignore: false },
    mode: "check",
    onlyRules: ["banned-patterns"],
    rules: {
      bannedPatterns: {
        patterns: ["AUTO_EXCLUDED_TOKEN", packageStatePattern],
      },
    },
  });
  assert.equal(result.violations.some((violation) => violation.filePath.startsWith(".trebired/code-discipline/")), false);
}

async function verifyLanguageFix(projectRoot) {
  await codeDiscipline(options(projectRoot, "fix", ["remove-comments"]));
  const python = await fs.readFile(path.join(projectRoot, "src", "tool.py"), "utf8");
  const shell = await fs.readFile(path.join(projectRoot, "src", "run.sh"), "utf8");
  const qml = await fs.readFile(path.join(projectRoot, "src", "View.qml"), "utf8");
  assert.ok(python.includes("#!/usr/bin/env python3"));
  assert.ok(python.includes("# coding: utf-8"));
  assert.ok(python.includes("'# keep literal'"));
  assert.ok(python.includes("# keep triple string"));
  assert.equal(python.includes("remove python comment"), false);
  assert.ok(shell.includes("#!/usr/bin/env sh"));
  assert.ok(shell.includes("value # keep literal"));
  assert.ok(shell.includes("# keep heredoc text"));
  assert.equal(shell.includes("remove shell comment"), false);
  assert.ok(qml.includes("literal // keep"));
  assert.ok(qml.includes("/* keep block */"));
  assert.ok(qml.includes("https?:\\/\\/example"));
  assert.ok(qml.includes("// keep template"));
  assert.equal(qml.includes("remove qml comment"), false);
  assert.equal(qml.includes("remove inline qml comment"), false);
}

async function verifyStructuralBlankLines(projectRoot) {
  const check = await codeDiscipline(structuralOptions(projectRoot, "check"));
  const files = check.violations.map((violation) => violation.filePath).sort();

  assert.equal(check.ok, false);
  assert.ok(files.includes("src/spacing.css"));
  assert.ok(files.includes("src/spacing.go"));
  assert.ok(files.includes("src/spacing.py"));
  assert.ok(files.includes("src/spacing.qml"));
  assert.ok(files.includes("src/spacing.rs"));
  assert.ok(files.includes("src/spacing.sh"));

  const fix = await codeDiscipline(structuralOptions(projectRoot, "fix"));
  assert.equal(fix.ok, true);
  assert.ok((fix.ruleResults["structural-blank-lines"]?.rewritten_files ?? 0) >= 6);

  const clean = await codeDiscipline(structuralOptions(projectRoot, "check"));
  assert.equal(clean.ok, true, JSON.stringify(clean.violations, null, 2));
}

async function verifyFolderizeAcrossLanguages() {
  const projectRoot = await createFolderizeProject();
  const check = await codeDiscipline(folderizeOptions(projectRoot, "check"));
  const files = check.violations.map((violation) => violation.filePath).sort();

  assert.equal(check.ok, false);
  assert.ok(files.includes("src/app_main.go"));
  assert.ok(files.includes("src/module_alpha.py"));
  assert.ok(files.includes("src/render_svg.rs"));
  assert.ok(files.includes("src/style_base.css"));
  assert.ok(files.includes("src/task_run.sh"));
  assert.ok(files.includes("src/view_logic.qml"));

  const fix = await codeDiscipline(folderizeOptions(projectRoot, "fix"));
  assert.equal(fix.ok, true);
  assert.equal(fix.moved_files, 12);
  await fs.access(path.join(projectRoot, "src", "app", "main.go"));
  await fs.access(path.join(projectRoot, "src", "module", "alpha.py"));
  await fs.access(path.join(projectRoot, "src", "render", "svg.rs"));
  await fs.access(path.join(projectRoot, "src", "style", "theme.css"));
  await fs.access(path.join(projectRoot, "src", "task", "sync.sh"));
  await fs.access(path.join(projectRoot, "src", "view", "model.qml"));
}

const projectRoot = await createLanguageProject();
await verifyLanguageCheck(projectRoot);
await verifyPackageStateExclusion(projectRoot);
await verifyLanguageFix(projectRoot);
await verifyStructuralBlankLines(projectRoot);
await verifyFolderizeAcrossLanguages();

console.log("language support verification passed");
