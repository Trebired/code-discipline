import path from "node:path";

import { stripKnownExtension, toPosixPath } from "#ntve5i5a0mol";

function formatRelativeSpecifier(
  originalSpecifier: string,
  fromAbsolutePath: string,
  toAbsolutePath: string,
  sourceExtensions: string[],
): string {
  const hadExplicitExtension = sourceExtensions.some((extension) => originalSpecifier.toLowerCase().endsWith(extension.toLowerCase()));
  let relativePath = toPosixPath(path.relative(path.dirname(fromAbsolutePath), toAbsolutePath));
  if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`;

  if (hadExplicitExtension) {
    return relativePath;
  }

  const withoutExtension = stripKnownExtension(relativePath, sourceExtensions);
  const targetBasename = path.basename(toAbsolutePath);
  const originalWithoutExtension = stripKnownExtension(originalSpecifier, sourceExtensions);
  const originalUsesIndex = /(^|\/)index$/.test(originalWithoutExtension);

  if (targetBasename.startsWith("index.") && !originalUsesIndex) {
    return withoutExtension.replace(/\/index$/, "") || ".";
  }

  return withoutExtension;
}

export { formatRelativeSpecifier };
