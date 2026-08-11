import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import {
  isCppExtension,
  isCsharpExtension,
  isGoExtension,
  isPythonExtension,
  isQmlExtension,
  isRustExtension,
  isShellExtension,
  isTypeScriptFamilyExtension,
  supportsDry,
} from "#87jyjzn68rrk";

type DryFunctionDescriptor = {
  absolutePath: string;
  behaviorFingerprint?: string;
  characterCount: number;
  classification: "method" | "standalone";
  fingerprint: string;
  filePath: string;
  language: string;
  localName?: string;
  normalizedName?: string;
  normalizedText: string;
  order: number;
  startLine: number;
  topLevel: boolean;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
};

function filterDrySourceFiles(sourceFiles: ScannedSourceFile[]): ScannedSourceFile[] {
  return sourceFiles.filter((file) => supportsDry(file.extension));
}

function dryLanguageKey(extension: string): string {
  if (isTypeScriptFamilyExtension(extension)) return "typescript";
  if (isGoExtension(extension)) return "go";
  if (isRustExtension(extension)) return "rust";
  if (isCppExtension(extension)) return "cpp";
  if (isCsharpExtension(extension)) return "csharp";
  if (isPythonExtension(extension)) return "python";
  if (isShellExtension(extension)) return "shell";
  if (isQmlExtension(extension)) return "qml";
  return extension;
}

function normalizeDryFunctionName(name: string | undefined): string | undefined {
  const normalized = name?.trim().toLowerCase();
  return normalized || undefined;
}

export { dryLanguageKey, filterDrySourceFiles, normalizeDryFunctionName };
export type { DryFunctionDescriptor };
