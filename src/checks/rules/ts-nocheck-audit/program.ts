import path from "node:path";

import ts from "typescript";

import { resolveScriptKind } from "../../../imports/module-specifiers.js";
import { resolveTsconfigPath } from "../../../runtime/tsconfig-paths.js";
import { InvalidTsconfigPathError } from "../../../shared/errors.js";
import { pathExists } from "../../../shared/utils.js";
import { removeLeadingTsNocheckLine } from "./pragma.js";

type StrippedProgramCandidate = {
  absolutePath: string;
  text: string;
};

function createStrippedCompilerHost(
  compilerOptions: ts.CompilerOptions,
  strippedTextByPath: Map<string, string>,
): ts.CompilerHost {
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile) => {
    const overrideText = strippedTextByPath.get(path.resolve(fileName));
    if (overrideText === undefined) {
      return originalGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    }

    return ts.createSourceFile(fileName, overrideText, languageVersionOrOptions, true, resolveScriptKind(fileName));
  };

  return host;
}

async function buildStrippedProgram(args: {
  tsconfigPath: string;
  candidates: StrippedProgramCandidate[];
}): Promise<ts.Program> {
  if (!await pathExists(args.tsconfigPath)) {
    throw new InvalidTsconfigPathError(args.tsconfigPath);
  }

  const configFile = ts.readConfigFile(args.tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new InvalidTsconfigPathError(args.tsconfigPath);
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(args.tsconfigPath));
  const strippedTextByPath = new Map<string, string>();

  for (const candidate of args.candidates) {
    const stripped = removeLeadingTsNocheckLine(candidate.text);
    if (stripped.removed) {
      strippedTextByPath.set(path.resolve(candidate.absolutePath), stripped.text);
    }
  }

  const rootNames = Array.from(new Set([
    ...parsed.fileNames,
    ...args.candidates.map((candidate) => path.resolve(candidate.absolutePath)),
  ]));

  const host = createStrippedCompilerHost(parsed.options, strippedTextByPath);
  return ts.createProgram({ rootNames, options: parsed.options, host });
}

function getSemanticDiagnosticCount(program: ts.Program, absolutePath: string): number {
  const sourceFile = program.getSourceFile(path.resolve(absolutePath));
  if (!sourceFile) return -1;

  return program.getSemanticDiagnostics(sourceFile).length;
}

export { buildStrippedProgram, getSemanticDiagnosticCount, resolveTsconfigPath };
export type { StrippedProgramCandidate };
