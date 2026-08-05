import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CODE_DISCIPLINE_PACKAGE_NAME } from "#ik5y0pee4ah1";

type NativeBinding = {
  collectRemoveCommentsViolations(requestJson: string): string;
  formatSourceFiles(requestJson: string): string;
  formatSourceText(requestJson: string): string;
  fixRemoveCommentsRule(requestJson: string): string;
  runRedundantPathSegmentsRule(requestJson: string): string;
  runMaxBlockFunctionLinesRule(requestJson: string): string;
  runMaxFileLinesRule(requestJson: string): string;
  scanSourceFiles(requestJson: string): string;
  stripComments(requestJson: string): string;
};

let cachedBinding: NativeBinding | null | undefined;

function linuxLibcVariant(): "gnu" | "musl" {
  const report = typeof process.report?.getReport === "function" ? process.report.getReport() : null;
  const header = report && typeof report === "object" ? (report as { header?: { glibcVersionRuntime?: string } }).header : null;
  if (header?.glibcVersionRuntime) return "gnu";
  if (fs.existsSync("/etc/alpine-release")) return "musl";
  return "gnu";
}

function nativeBinaryBasenameForCurrentPlatform(): string | null {
  if (process.platform === "linux") {
    const libc = linuxLibcVariant();
    if (process.arch === "x64") return `linux-x64-${libc}.node`;
    if (process.arch === "arm64") return `linux-arm64-${libc}.node`;
    return null;
  }

  if (process.platform === "darwin") {
    if (process.arch === "x64") return "darwin-x64.node";
    if (process.arch === "arm64") return "darwin-arm64.node";
    return null;
  }

  return null;
}

function nativeAddonCandidatePathsForCurrentPlatform(): string[] {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const binaryName = nativeBinaryBasenameForCurrentPlatform();
  const envOverride = process.env.TB_CODE_DISCIPLINE_NATIVE_BINARY
    ? path.resolve(process.env.TB_CODE_DISCIPLINE_NATIVE_BINARY)
    : "";

  return [
    envOverride,
    binaryName ? path.resolve(currentDir, "../../native", binaryName) : "",
    binaryName ? path.resolve(process.cwd(), "native", binaryName) : "",
    path.resolve(currentDir, "../../native/index.node"),
    path.resolve(process.cwd(), "native/index.node"),
    path.resolve(currentDir, "../../native/code-discipline-native/index.node"),
    path.resolve(process.cwd(), "native/code-discipline-native/index.node"),
  ].filter(Boolean);
}

function loadNativeBinding(): NativeBinding | null {
  if (cachedBinding !== undefined) return cachedBinding;
  if (process.env.TB_CODE_DISCIPLINE_DISABLE_NATIVE === "1") {
    cachedBinding = null;
    return cachedBinding;
  }

  const require = createRequire(import.meta.url);

  for (const candidate of nativeAddonCandidatePathsForCurrentPlatform()) {
    if (!fs.existsSync(candidate)) continue;
    try {
      cachedBinding = require(candidate) as NativeBinding;
      return cachedBinding;
    } catch {}
  }

  cachedBinding = null;
  return cachedBinding;
}

function resetNativeBindingForTests(): void {
  cachedBinding = undefined;
}

function activeNativeBackendNotice(): string {
  return loadNativeBinding()
    ? `${CODE_DISCIPLINE_PACKAGE_NAME} using native backend`
    : `${CODE_DISCIPLINE_PACKAGE_NAME} using TS fallback backend`;
}

export {
  activeNativeBackendNotice,
  loadNativeBinding,
  nativeAddonCandidatePathsForCurrentPlatform,
  nativeBinaryBasenameForCurrentPlatform,
  resetNativeBindingForTests,
};
export type { NativeBinding };
