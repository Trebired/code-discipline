import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createLog } from "@package/logger";

const log = createLog({ console: true, save: false });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { run } = await import(pathToFileURL(path.join(repoRoot, "dist/index.js")).href);

const CASES = [
  {
    file: "trait_bodiless.rs",
    flagged: false,
    lines: ["pub trait A {", "    fn x();", "}", "", "pub trait B {", "    fn y();", "}", "", "impl A for u8 {", "    fn x() {}", "}"],
  },
  { file: "extern_block.rs", flagged: true, lines: ["extern \"C\" {", "    fn x();", "}", "fn a() {}", "fn b() {}"] },
  { file: "lifetime.rs", flagged: true, lines: ["fn a(x: &'a str) {", "    x;", "}", "fn b() {", "}", "", "", "fn c() {", "}"] },
  { file: "pub_items.rs", flagged: true, lines: ["pub struct A {", "    a: u8,", "}", "impl<T> Drop for B<T> {", "    fn drop(&mut self) {}", "}"] },
  { file: "unit_structs.rs", flagged: false, lines: ["#[derive(Debug)]", "struct A;", "#[derive(Debug)]", "struct B(u8);"] },
  { file: "raw_braces.rs", flagged: true, lines: ["fn a() -> &'static str {", "    r#\"", "fn x() {", "\"#", "}", "fn b() {}"] },
  { file: "arrows.ts", flagged: false, lines: ["const a = () => {", "  return 1;", "};", "const b = () => {", "  return 2;", "};"] },
  { file: "members.ts", flagged: true, lines: ["class A {", "  x() {", "    return 1;", "  }", "  y() {", "    return 2;", "  }", "}"] },
  {
    file: "overloads.ts",
    flagged: false,
    lines: ["function f(a: string): string;", "function f(a: number): number;", "function f(a: any) {", "  return a;", "}"],
  },
  { file: "heredoc.sh", flagged: false, lines: ["one() {", "  cat <<EOF", "two() {", "EOF", "}"] },
];

function structuralOptions(projectRoot, mode) {
  return {
    projectRoot,
    ignore: { use_gitignore: false },
    mode,
    onlyRules: ["structural-blank-lines"],
    rules: { structuralBlankLines: {} },
  };
}

async function runCase(testCase) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cd-structural-"));
  const filePath = path.join(projectRoot, "src", testCase.file);
  const source = [...testCase.lines, ""].join("\n");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, source, "utf8");

  const before = await run(structuralOptions(projectRoot, "check"));
  await run(structuralOptions(projectRoot, "fix"));
  const fixed = await fs.readFile(filePath, "utf8");
  const after = await run(structuralOptions(projectRoot, "check"));
  await run(structuralOptions(projectRoot, "fix"));

  assert.equal(before.violations.length > 0, testCase.flagged, `${testCase.file}: check result`);
  assert.equal(fixed !== source, testCase.flagged, `${testCase.file}: check and fix disagree`);
  assert.deepEqual(after.violations, [], `${testCase.file}: check still fails after fix`);
  assert.equal(await fs.readFile(filePath, "utf8"), fixed, `${testCase.file}: a second fix changed the file`);
  await fs.rm(projectRoot, { force: true, recursive: true });
}

for (const testCase of CASES) {
  await runCase(testCase);
}

log.info("verify.structural", "structural blank lines verification passed");
