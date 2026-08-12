import { normalizeRelativePath, uniqueStrings } from "#ntve5i5a0mol";

function normalizeAllowedFiles(files: string[] | undefined): string[] {
  return uniqueStrings(
    (files ?? [])
    .map((filePath) => normalizeRelativePath(String(filePath).trim()))
    .filter(Boolean),
  );
}

export { normalizeAllowedFiles };
