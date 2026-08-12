import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { run } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function createProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cd-dead-imports-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), "{\"type\":\"module\"}\n", "utf8");
  await fs.writeFile(path.join(root, "tsconfig.json"), "{\"compilerOptions\":{\"paths\":{}}}\n", "utf8");
  await fs.writeFile(path.join(root, "src/main.ts"), [
      "import *as compactNamespace from \"compact-namespace\";",
      "import * as spacedNamespace from \"spaced-namespace\";",
      "import unusedDefault from \"unused-default\";",
      "import { usedNamed, unusedNamed as unusedAlias } from \"named\";",
      "",
      "const compactValue = compactNamespace.normalize(\"value\");",
      "const spacedValue = spacedNamespace.ok(usedNamed);",
      "",
      "export { compactValue, spacedValue };",
      "",
    ].join("\n"), "utf8");
  return root;
}

async function verifyNamespaceImportsAreTracked() {
  const projectRoot = await createProject();
  const result = await run({
      projectRoot,
      mode: "check",
      onlyRules: ["imports"],
      ignore: { use_gitignore: false },
      rules: {
        imports: {
          allowRelative: ["./"],
          removeDeadImports: true,
        },
      },
  });
  const names = result.violations
  .map((violation) => violation.details.name)
  .filter((name) => typeof name === "string")
  .sort();

  assert.equal(result.ok, false);
  assert.deepEqual(names, ["unusedAlias", "unusedDefault"]);
}

await verifyNamespaceImportsAreTracked();
