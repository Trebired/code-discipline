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
const PYTHON_FAMILY_EXTENSIONS = new Set([".py"]);
const QML_FAMILY_EXTENSIONS = new Set([".qml"]);
const RUST_FAMILY_EXTENSIONS = new Set([".rs"]);
const SHELL_FAMILY_EXTENSIONS = new Set([".bash", ".sh", ".zsh"]);
const STYLE_FAMILY_EXTENSIONS = new Set([".scss", ".css"]);

function normalizeExtension(value: string): string {
  return value.startsWith(".") ? value.toLowerCase() : path.extname(value).toLowerCase();
}

function isTypeScriptFamilyExtension(value: string): boolean {
  return TYPESCRIPT_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isGoExtension(value: string): boolean {
  return GO_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isPythonExtension(value: string): boolean {
  return PYTHON_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isQmlExtension(value: string): boolean {
  return QML_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isRustExtension(value: string): boolean {
  return RUST_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isShellExtension(value: string): boolean {
  return SHELL_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function isScssExtension(value: string): boolean {
  return normalizeExtension(value) === ".scss";
}

function isStyleExtension(value: string): boolean {
  return STYLE_FAMILY_EXTENSIONS.has(normalizeExtension(value));
}

function supportsImports(value: string): boolean {
  return isTypeScriptFamilyExtension(value) || isScssExtension(value);
}

function supportsFolderizationFix(value: string): boolean {
  return supportsImports(value);
}

function supportsMaxFunctionLines(value: string): boolean {
  return isTypeScriptFamilyExtension(value) || isGoExtension(value) || isRustExtension(value) || isPythonExtension(value) || isShellExtension(value) || isQmlExtension(value);
}

function supportsRemoveComments(value: string): boolean {
  return isTypeScriptFamilyExtension(value) || isGoExtension(value) || isRustExtension(value) || isPythonExtension(value) || isShellExtension(value) || isQmlExtension(value) || isStyleExtension(value);
}

export {
  isGoExtension,
  isPythonExtension,
  isQmlExtension,
  isRustExtension,
  isShellExtension,
  isScssExtension,
  isStyleExtension,
  isTypeScriptFamilyExtension,
  supportsFolderizationFix,
  supportsMaxFunctionLines,
  supportsRemoveComments,
  supportsImports,
};
