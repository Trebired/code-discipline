import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { RANDOM_ALIAS_ALPHABET } from "./constants.js";
import { ParseFailureError } from "./errors.js";
import type { TsconfigJson } from "../imports/types.js";

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function normalizeRelativePath(value: string): string {
  const normalized = toPosixPath(value).replace(/^\.\/+/, "").replace(/\/+/g, "/");
  return normalized === "." ? "" : normalized;
}

function ensureDotExtension(value: string): string {
  return value.startsWith(".") ? value.toLowerCase() : `.${value.toLowerCase()}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function stripKnownExtension(filePath: string, extensions: string[]): string {
  const match = extensions.find((extension) => filePath.toLowerCase().endsWith(extension.toLowerCase()));
  return match ? filePath.slice(0, filePath.length - match.length) : filePath;
}

function isInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relative = path.relative(directoryPath, filePath);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function createRandomToken(length: number): string {
  const bytes = randomBytes(length * 2);
  let token = "";

  for (const value of bytes) {
    token += RANDOM_ALIAS_ALPHABET[value % RANDOM_ALIAS_ALPHABET.length];
    if (token.length >= length) break;
  }

  return token;
}

function createHashToken(value: string, length: number): string {
  return createHash("sha1").update(value).digest("hex").slice(0, length);
}

function createSlugToken(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "module";
}

function isAliasIdValid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.trim()) return false;
  if (/\s/.test(value)) return false;
  if (value.startsWith(".") || value.startsWith("/")) return false;
  if (value.includes("\0") || value.includes("\"") || value.includes("'")) return false;
  return true;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sortObject(entry));
  if (!value || typeof value !== "object") return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    result[key] = sortObject((value as Record<string, unknown>)[key]);
  }
  return result;
}

function toStableJson(value: unknown): string {
  return `${JSON.stringify(sortObject(value), null, 2)}\n`;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isDirectExecution(importMetaUrl: string, argv1: string | undefined): Promise<boolean> {
  if (!argv1) return false;

  try {
    const launchedPath = await fs.realpath(path.resolve(argv1));
    const modulePath = await fs.realpath(fileURLToPath(importMetaUrl));
    return launchedPath === modulePath;
  } catch {
    return false;
  }
}

function parseTsconfigJson(text: string, filePath: string): TsconfigJson {
  const parsed = ts.parseConfigFileTextToJson(filePath, text);
  if (parsed.error) {
    throw new ParseFailureError(filePath, flattenDiagnosticMessage(parsed.error.messageText));
  }

  const config = parsed.config;
  return config && typeof config === "object" ? (config as TsconfigJson) : {};
}

function flattenDiagnosticMessage(messageText: string | ts.DiagnosticMessageChain): string {
  return typeof messageText === "string" ? messageText : ts.flattenDiagnosticMessageText(messageText, "\n");
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => flattenDiagnosticMessage(diagnostic.messageText));
}

export {
  createHashToken,
  createRandomToken,
  createSlugToken,
  ensureDotExtension,
  flattenDiagnosticMessage,
  formatDiagnostics,
  isDirectExecution,
  isAliasIdValid,
  isDirectory,
  isFile,
  isInsideDirectory,
  normalizeRelativePath,
  parseTsconfigJson,
  pathExists,
  sortStrings,
  stableSerialize,
  stripKnownExtension,
  toPosixPath,
  toStableJson,
  uniqueStrings,
  wait,
};
