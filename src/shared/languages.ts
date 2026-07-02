import path from "node:path";

const TYPESCRIPT_FAMILY_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const GO_FAMILY_EXTENSIONS = new Set([".go"]);
const RUST_FAMILY_EXTENSIONS = new Set([".rs"]);

function normalizeExtension(value: string): string {
  return value.startsWith(".") ? value.toLowerCase() : path.extname(value).toLowerCase();
}

function isTypeScriptFamilyExtension(value: string): boolean {
  return TYPESCRIPT_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isGoExtension(value: string): boolean {
  return GO_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isRustExtension(value: string): boolean {
  return RUST_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function supportsSyncImports(value: string): boolean {
  return isTypeScriptFamilyExtension(value);
}

function supportsFolderizationFix(value: string): boolean {
  return isTypeScriptFamilyExtension(value);
}

function supportsMaxFunctionLines(value: string): boolean {
  return isTypeScriptFamilyExtension(value) || isGoExtension(value) || isRustExtension(value);
}

function supportsRemoveComments(value: string): boolean {
  return isTypeScriptFamilyExtension(value) || isGoExtension(value) || isRustExtension(value);
}

export {
  isGoExtension,
  isRustExtension,
  isTypeScriptFamilyExtension,
  supportsFolderizationFix,
  supportsMaxFunctionLines,
  supportsRemoveComments,
  supportsSyncImports,
};
