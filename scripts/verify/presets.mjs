import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { codeDiscipline } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

async function createProject(name) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `cd-presets-${name}-`));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  return root;
}

async function writeSource(root, relativePath, text) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
  await fs.appendFile(filePath, "", "utf8");
  return filePath;
}

function presetOptions(projectRoot, extra = {}) {
  return {
    projectRoot,
    mode: "check",
    ignore: { use_gitignore: false },
    logging: { warnings: false },
    presets: { use: ["trebired"] },
    ...extra,
  };
}

async function verifyNamedPresetEnablesStrictRules() {
  const projectRoot = await createProject("strict");
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["max-file-lines"],
  }));

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].rule, "max-file-lines");
  assert.equal(result.violations[0].filePath, "src/large.ts");
}

async function verifyRepoConfigOverridesPresetScalars() {
  const projectRoot = await createProject("override");
  await writeSource(projectRoot, "src/large.ts", Array.from({ length: 351 }, (_, index) => `export const value${index} = ${index};`).join("\n"));

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["max-file-lines"],
        rules: {
          maxFileLines: {
            max: 400,
          },
        },
  }));

  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
}

async function verifyBannedPatternsMergeDuplicateAllowlists() {
  const projectRoot = await createProject("patterns");
  await writeSource(projectRoot, "src/name.ts", "export const packageName = \"trebired\";\n");
  await writeSource(projectRoot, "src/custom.ts", "export const packageName = \"custom-token\";\n");

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["banned-patterns"],
        rules: {
          bannedPatterns: {
            patterns: [
              { value: "trebired", allowedFiles: ["src/name.ts"] },
              { value: "custom-token" },
            ],
          },
        },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => violation.filePath), ["src/custom.ts"]);
  assert.equal(result.violations[0].details.pattern, "custom-token");
}

async function verifyNodeProcessBoundaryStillMerges() {
  const projectRoot = await createProject("node-boundary");
  await writeSource(projectRoot, "src/env.ts", "export const value = process.env.TEST_VALUE;\n");
  await writeSource(projectRoot, "src/other.ts", "export const value = process.env.OTHER_VALUE;\n");

  const result = await codeDiscipline(presetOptions(projectRoot, {
        onlyRules: ["banned-patterns"],
        presets: {
          use: ["trebired"],
          nodeProcessBoundary: {
            envBoundaryFiles: ["src/env.ts"],
          },
        },
  }));

  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map((violation) => violation.filePath), ["src/other.ts"]);
  assert.equal(result.violations[0].details.pattern, "process.env");
}

async function verifyUnknownPresetFailsClearly() {
  const projectRoot = await createProject("unknown");
  await writeSource(projectRoot, "src/main.ts", "export const value = 1;\n");

  await assert.rejects(
    () => codeDiscipline({
        projectRoot,
        mode: "check",
        presets: {
          use: ["unknown"],
        },
    }),
    /Unknown code discipline preset: unknown/,
  );
}

await verifyNamedPresetEnablesStrictRules();
await verifyRepoConfigOverridesPresetScalars();
await verifyBannedPatternsMergeDuplicateAllowlists();
await verifyNodeProcessBoundaryStillMerges();
await verifyUnknownPresetFailsClearly();

console.log("code discipline presets verification passed");
