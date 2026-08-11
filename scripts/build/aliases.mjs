import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const aliasMapDir = path.join(repoRoot, ".trebired/code-discipline", "imports");
const sourceRoot = path.join(repoRoot, "src");
const distRoot = path.join(repoRoot, "dist");

function escapeAliasPattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readAliasMap() {
  if (!fs.existsSync(aliasMapDir)) return new Map();
  const aliases = new Map();
  const files = fs
  .readdirSync(aliasMapDir)
  .filter((file) => file.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(aliasMapDir, file), "utf8");
    const parsed = JSON.parse(raw);
    for (const [alias, target] of Object.entries(parsed)) {
      if (typeof target === "string") aliases.set(alias, target);
    }
  }

  return aliases;
}

function resolveDistTarget(target) {
  const sourceTarget = path.resolve(repoRoot, target);
  if (!sourceTarget.startsWith(`${sourceRoot}${path.sep}`)) return "";
  const relativeSource = path.relative(sourceRoot, sourceTarget);
  const relativeOutput = relativeSource.replace(/\.(cts|mts|tsx?|jsx?)$/, ".js");
  return path.join(distRoot, relativeOutput);
}

function formatBuildSpecifier(fromFile, toFile) {
  let specifier = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
  if (!specifier.startsWith(".")) specifier = `./${specifier}`;
  return specifier;
}

function listBuildFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listBuildFiles(entryPath));
      continue;
    }
    if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

const aliases = readAliasMap();

if (aliases.size === 0 || !fs.existsSync(distRoot)) process.exit(0);

for (const file of listBuildFiles(distRoot)) {
  let text = fs.readFileSync(file, "utf8");
  const original = text;

  for (const [alias, target] of aliases) {
    const distTarget = resolveDistTarget(target);
    if (!distTarget) continue;
    const specifier = formatBuildSpecifier(file, distTarget);
    const pattern = new RegExp(`(["'])${escapeAliasPattern(alias)}\\1`, "g");
    text = text.replace(pattern, `$1${specifier}$1`);
  }

  if (text !== original) fs.writeFileSync(file, text);
}
