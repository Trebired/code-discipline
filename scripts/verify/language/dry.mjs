import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { codeDiscipline } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function writeFixture(root, relativePath, text) {
  const destination = path.join(root, relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, text, "utf8");
}

function duplicateFixtures() {
  return {
    "src/go/one.go": "package main\nfunc one(value int) int {\n  total := value + 1\n  return total\n}\n",
    "src/go/two.go": "package main\nfunc two(input int) int {\n  result := input + 1\n  return result\n}\n",
    "src/python/one.py": "def one(value):\n    total = value + 1\n    return total\n",
    "src/python/two.py": "def two(input):\n    result = input + 1\n    return result\n",
    "src/qml/One.qml": "QtObject {\n  function one(value) { const total = value + 1; return total }\n}\n",
    "src/qml/Two.qml": "QtObject {\n  function two(input) { const result = input + 1; return result }\n}\n",
    "src/rust/one.rs": "fn one(value: i32) -> i32 {\n    let total = value + 1;\n    total\n}\n",
    "src/rust/two.rs": "fn two(input: i32) -> i32 {\n    let result = input + 1;\n    result\n}\n",
    "src/cpp/one.cpp": "int one(int value) {\n    int total = value + 1;\n    return total;\n}\n",
    "src/cpp/two.cpp": "int two(int input) {\n    int result = input + 1;\n    return result;\n}\n",
    "src/csharp/One.cs": "class One\n{\n    int One(int value)\n    {\n        int total = value + 1;\n        return total;\n    }\n}\n",
    "src/csharp/Two.cs": "class Two\n{\n    int Two(int input)\n    {\n        int result = input + 1;\n        return result;\n    }\n}\n",
    "src/shell/one.sh": "one() {\n  local total=$1\n  echo ok\n}\n",
    "src/shell/two.sh": "two() {\n  local result=$1\n  echo ok\n}\n",
  };
}

async function createDryProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-language-dry-"));
  for (const [relativePath, text] of Object.entries(duplicateFixtures())) {
    await writeFixture(root, relativePath, text);
  }
  return root;
}

function dryOptions(projectRoot) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode: "check",
    onlyRules: ["dry"],
    rules: {
      dry: {},
    },
  };
}

async function verifyDryAcrossLanguages() {
  const result = await codeDiscipline(dryOptions(await createDryProject()));
  const functions = result.violations.flatMap((violation) => violation.details?.functions ?? []);
  const languages = new Set(functions.map((entry) => entry.language));

  assert.equal(result.ok, false);
  assert.ok(languages.has("go"));
  assert.ok(languages.has("python"));
  assert.ok(languages.has("qml"));
  assert.ok(languages.has("rust"));
  assert.ok(languages.has("shell"));
  assert.ok(languages.has("cpp"));
  assert.ok(languages.has("csharp"));
}

await verifyDryAcrossLanguages();

console.log("language dry verification passed");
