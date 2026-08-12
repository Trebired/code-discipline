import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  config?: {
    organization?: {
      name?: string;
    };
  };
  name?: string;
  version?: string;
};

function findPackageJsonPath(): string | null {
  let current = path.dirname(fileURLToPath(import.meta.url));

  for (let index = 0; index < 8; index += 1) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function readOwnPackageJson(): PackageJson {
  const packageJsonPath = findPackageJsonPath();
  if (!packageJsonPath) return {};

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
  } catch {
    return {};
  }
}

function cleanSegment(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function packageScope(name: string): string {
  return new RegExp("^@([^/]+)/").exec(name)?.[1] ?? "";
}

function packageSlug(name: string): string {
  return name.replace(new RegExp("^@[^/]+/"), "").trim();
}

const packageJson = readOwnPackageJson();
const PACKAGE_JSON_NAME = cleanSegment(packageJson.name);
const PACKAGE_JSON_VERSION = cleanSegment(packageJson.version);
const PACKAGE_CONFIG_ORGANIZATION_NAME = cleanSegment(packageJson.config?.organization?.name);
const PACKAGE_NAME = PACKAGE_JSON_NAME || (PACKAGE_CONFIG_ORGANIZATION_NAME ? `@${PACKAGE_CONFIG_ORGANIZATION_NAME}/code-discipline` : "code-discip" +
  "line");
const PACKAGE_ORGANIZATION_NAME = PACKAGE_CONFIG_ORGANIZATION_NAME || packageScope(PACKAGE_JSON_NAME);
const PACKAGE_SLUG = packageSlug(PACKAGE_NAME) || "code-discipline";
const PACKAGE_VERSION = PACKAGE_JSON_VERSION || "0.0.0";

function buildPackageLogGroup(...parts: string[]): string {
  return [PACKAGE_ORGANIZATION_NAME, PACKAGE_SLUG, ...parts]
  .map((part) => part.trim())
  .filter(Boolean)
  .join(".");
}

export {
  buildPackageLogGroup,
  PACKAGE_NAME,
  PACKAGE_ORGANIZATION_NAME,
  PACKAGE_SLUG,
  PACKAGE_VERSION,
};
