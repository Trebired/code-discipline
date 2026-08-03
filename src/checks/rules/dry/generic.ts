import { collectLanguageFunctionDescriptors, type FunctionDescriptor } from "#9tcp2jgf8qlj";
import { scanRustRawString } from "#9cs5z6nffer3";
import { maskCommentsForLineCounting } from "#mv1bbdtri77n";
import type { ScannedSourceFile } from "#pkb9x3eo56l7";
import { stableSerialize } from "#ntve5i5a0mol";
import type { DryFunctionDescriptor } from "./model.js";
import { dryLanguageKey, normalizeDryFunctionName } from "./model.js";

const GENERIC_DRY_KEYWORDS = new Set([
  "and",
  "as",
  "async",
  "await",
  "break",
  "case",
  "class",
  "const",
  "continue",
  "def",
  "default",
  "defer",
  "do",
  "done",
  "elif",
  "else",
  "enum",
  "esac",
  "except",
  "false",
  "fi",
  "fn",
  "for",
  "func",
  "function",
  "if",
  "impl",
  "in",
  "interface",
  "let",
  "local",
  "loop",
  "match",
  "mut",
  "nil",
  "none",
  "not",
  "null",
  "or",
  "package",
  "pass",
  "property",
  "pub",
  "range",
  "return",
  "self",
  "struct",
  "then",
  "this",
  "trait",
  "true",
  "try",
  "type",
  "unsafe",
  "var",
  "while",
  "with",
]);

const HEADER_NAME_PREFIXES = new Set(["def", "fn", "func", "function"]);
const IDENTIFIER_PART_PATTERN = /[$\w]/u;
const IDENTIFIER_START_PATTERN = /[$A-Za-z_]/u;

type GenericTokenState = {
  identifiers: Map<string, string>;
  nextIdentifier: number;
  tokens: string[];
};

function previousNonWhitespace(text: string, start: number): string {
  for (let index = start - 1; index >= 0; index -= 1) {
    const character = text[index] ?? "";
    if (!/\s/u.test(character)) return character;
  }
  return "";
}

function nextNonWhitespace(text: string, start: number): string {
  for (let index = start; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (!/\s/u.test(character)) return character;
  }
  return "";
}

function scanQuotedLiteral(text: string, start: number): number | null {
  const quote = text[start] ?? "";
  if (quote !== "\"" && quote !== "'" && quote !== "`") return null;

  const triple = quote !== "`" && text.slice(start, start + 3) === quote.repeat(3);
  if (triple) {
    const closeIndex = text.indexOf(quote.repeat(3), start + 3);
    return closeIndex < 0 ? text.length : closeIndex + 3;
  }

  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === quote) return index + 1;
  }
  return text.length;
}

function readIdentifier(text: string, start: number): { end: number; value: string } {
  let end = start + 1;
  while (IDENTIFIER_PART_PATTERN.test(text[end] ?? "")) end += 1;
  return { end, value: text.slice(start, end) };
}

function readNumberEnd(text: string, start: number): number {
  let end = start + 1;
  while (/[$\w.]/u.test(text[end] ?? "")) end += 1;
  return end;
}

function canonicalIdentifier(identifier: string, state: GenericTokenState): string {
  const existing = state.identifiers.get(identifier);
  if (existing) return existing;

  const next = `i${state.nextIdentifier}`;
  state.nextIdentifier += 1;
  state.identifiers.set(identifier, next);
  return next;
}

function normalizeIdentifierToken(args: {
  end: number;
  identifier: string;
  start: number;
  state: GenericTokenState;
  text: string;
}): string {
  const lower = args.identifier.toLowerCase();
  const previousToken = args.state.tokens[args.state.tokens.length - 1] ?? "";
  const previous = previousNonWhitespace(args.text, args.start);
  const next = nextNonWhitespace(args.text, args.end);

  if (GENERIC_DRY_KEYWORDS.has(lower)) return lower;
  if (HEADER_NAME_PREFIXES.has(previousToken)) return canonicalIdentifier(args.identifier, args.state);
  if (previous === "." || next === "!" || next === "(") return args.identifier;
  return canonicalIdentifier(args.identifier, args.state);
}

function normalizeFunctionHeader(source: string, extension: string): string {
  if (extension === ".go") return source.replace(/^(\s*func(?:\s*\([^)]*\))?\s+)[A-Za-z_]\w*/u, "$1__dry_function");
  if (extension === ".py") return source.replace(/^(\s*(?:async\s+)?def\s+)[A-Za-z_]\w*/u, "$1__dry_function");
  if (extension === ".qml") {
    return source
      .replace(/(\bfunction\s+)[A-Za-z_$][\w$]*/u, "$1__dry_function")
      .replace(/^(\s*)on[A-Z][\w$]*(\s*:)/u, "$1__dry_handler$2");
  }
  if (extension === ".sh" || extension === ".bash" || extension === ".zsh") {
    return source.replace(/^(\s*(?:function\s+)?)[A-Za-z_][\w-]*(\s*(?:\(\s*\))?\s*\{)/u, "$1__dry_function$2");
  }
  return source.replace(/^(\s*(?:(?:pub(?:\([^)]*\))?|async|const|unsafe)\s+)*fn\s+)[A-Za-z_]\w*/u, "$1__dry_function");
}

function tokenizeGenericDryText(text: string): string[] {
  const state: GenericTokenState = { identifiers: new Map(), nextIdentifier: 0, tokens: [] };
  let index = 0;

  while (index < text.length) {
    const character = text[index] ?? "";
    const rawStringEnd = scanRustRawString(text, index);
    const quotedEnd = rawStringEnd == null ? scanQuotedLiteral(text, index) : null;

    if (/\s/u.test(character)) index += 1;
    else if (rawStringEnd != null || quotedEnd != null) {
      const literalEnd = rawStringEnd ?? quotedEnd ?? text.length;
      state.tokens.push(`STR:${text.slice(index, literalEnd)}`);
      index = literalEnd;
    } else if (/\d/u.test(character)) {
      const numberEnd = readNumberEnd(text, index);
      state.tokens.push(`NUM:${text.slice(index, numberEnd)}`);
      index = numberEnd;
    } else if (IDENTIFIER_START_PATTERN.test(character)) {
      const identifier = readIdentifier(text, index);
      state.tokens.push(normalizeIdentifierToken({
        end: identifier.end,
        identifier: identifier.value,
        start: index,
        state,
        text,
      }));
      index = identifier.end;
    } else {
      state.tokens.push(character);
      index += 1;
    }
  }

  return state.tokens;
}

function sliceFunctionSource(text: string, descriptor: FunctionDescriptor): string {
  return text
    .split(/\r?\n/u)
    .slice(descriptor.startLine - 1, descriptor.endLine)
    .join("\n");
}

function createGenericFingerprint(source: string, extension: string) {
  const headerNormalized = normalizeFunctionHeader(source, extension);
  const commentMasked = maskCommentsForLineCounting(headerNormalized, extension);
  const tokens = tokenizeGenericDryText(commentMasked);
  const normalized = ["generic-function", tokens];

  return {
    fingerprint: stableSerialize(normalized),
    normalizedText: tokens.join(""),
  };
}

function createGenericDryDescriptor(
  file: ScannedSourceFile,
  text: string,
  descriptor: FunctionDescriptor,
): DryFunctionDescriptor {
  const fingerprint = createGenericFingerprint(sliceFunctionSource(text, descriptor), file.extension);

  return {
    absolutePath: file.absolutePath,
    characterCount: fingerprint.normalizedText.length,
    classification: descriptor.kind === "function" ? "standalone" : "method",
    fingerprint: fingerprint.fingerprint,
    filePath: file.relativeFromProjectRoot,
    language: dryLanguageKey(file.extension),
    localName: descriptor.name,
    normalizedName: normalizeDryFunctionName(descriptor.name),
    normalizedText: fingerprint.normalizedText,
    order: descriptor.startLine,
    startLine: descriptor.startLine,
    topLevel: false,
    usesOuterScope: true,
    usesRestrictedRuntime: false,
  };
}

function collectGenericDryFunctionDescriptors(file: ScannedSourceFile, text: string): DryFunctionDescriptor[] {
  return collectLanguageFunctionDescriptors(text, file.extension, file.absolutePath)
    .map((descriptor) => createGenericDryDescriptor(file, text, descriptor));
}

export { collectGenericDryFunctionDescriptors };
