import ts from "typescript";

import type { ScannedSourceFile } from "../../../imports/types.js";
import { isTypeScriptFamilyExtension } from "../../../shared/languages.js";

type DryFunctionDescriptor = {
  absolutePath: string;
  behaviorFingerprint?: string;
  characterCount: number;
  classification: "method" | "standalone";
  fingerprint: string;
  filePath: string;
  localName?: string;
  normalizedName?: string;
  nodeStart: number;
  normalizedText: string;
  sourceFile: ts.SourceFile;
  topLevel: boolean;
  usesOuterScope: boolean;
  usesRestrictedRuntime: boolean;
};

function filterDrySourceFiles(sourceFiles: ScannedSourceFile[]): ScannedSourceFile[] {
  return sourceFiles.filter((file) => isTypeScriptFamilyExtension(file.extension));
}

export { filterDrySourceFiles };
export type { DryFunctionDescriptor };
