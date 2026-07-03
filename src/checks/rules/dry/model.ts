import ts from "typescript";

import type { ScannedSourceFile } from "../../../imports/types.js";
import { isTypeScriptFamilyExtension } from "../../../shared/languages.js";

const DRY_RESOLUTION_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".cts",
  ".cjs",
];

type DryHelperDescriptor = {
  absolutePath: string;
  exportName: string;
  fingerprint: string;
  filePath: string;
  helperKey: string;
  importPath: string;
  localName: string;
  nodeEnd: number;
  nodeStart: number;
};

type DryCandidateDescriptor = {
  absolutePath: string;
  classification: "method" | "standalone" | "unsupported";
  fingerprint: string | null;
  filePath: string;
  helper: DryHelperDescriptor;
  localName?: string;
  nonFixableReason?: string;
  removalEnd: number;
  removalStart: number;
  safeToFix: boolean;
  sourceFile: ts.SourceFile;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
};

type ImportBinding = {
  exportName: string;
  localName: string;
};

function filterDrySourceFiles(sourceFiles: ScannedSourceFile[]): ScannedSourceFile[] {
  return sourceFiles.filter((file) => isTypeScriptFamilyExtension(file.extension));
}

export { DRY_RESOLUTION_EXTENSIONS, filterDrySourceFiles };
export type { DryCandidateDescriptor, DryHelperDescriptor, ImportBinding };
