import { expect, test } from "bun:test";

import { syncImports } from "../../../src/index.js";
import { readFile, readJson, tempProject, writeFile } from "../helpers.js";

function syncScssOptions(projectRoot: string) {
  return {
    projectRoot,
    alias: { strategy: "relative-path-slug" as const },
    allowRelative: [],
    packageJsonImports: {
      enabled: true,
      aliasPrefix: "#",
    },
  };
}

function writeScssRewriteFixture(projectRoot: string): void {
  writeFile(projectRoot, "package.json", JSON.stringify({ name: "scss-imports" }, null, 2));
  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "src/frontend/css/page.scss", `
@use "../core/palette" as palette;
@import "../core/legacy";

.page {
  color: palette.$brand;
}
`);
  writeFile(projectRoot, "src/frontend/css/index.scss", '@forward "../core/palette";\n');
  writeFile(projectRoot, "src/frontend/core/_legacy.scss", "$legacy: true;\n");
  writeFile(projectRoot, "src/frontend/core/_palette.scss", "$brand: #336699;\n");
}

test("reports and rewrites eligible SCSS @use, @forward, and @import specifiers", async () => {
  const projectRoot = tempProject();
  writeScssRewriteFixture(projectRoot);

  const checkResult = await syncImports({ ...syncScssOptions(projectRoot), fix: false });

  expect(checkResult.ok).toBe(false);
  expect(checkResult.violations).toContainEqual(expect.objectContaining({
    filePath: "src/frontend/css/page.scss",
    message: "relative import ../core/palette should be rewritten to #frontend-core-palette",
    details: expect.objectContaining({
      aliasId: "#frontend-core-palette",
      resolvedFile: "src/frontend/core/_palette.scss",
    }),
  }));
  expect(checkResult.violations).toContainEqual(expect.objectContaining({
    filePath: "src/frontend/css/index.scss",
    message: "relative import ../core/palette should be rewritten to #frontend-core-palette",
  }));

  const fixResult = await syncImports({ ...syncScssOptions(projectRoot), fix: true });

  expect(fixResult.ok).toBe(true);
  expect(fixResult.aliases_count).toBe(4);
  expect(fixResult.rewritten_files).toBe(2);
  expect(fixResult.rewritten_imports).toBe(3);
  expect(readFile(projectRoot, "src/frontend/css/page.scss")).toContain('@use "#frontend-core-palette" as palette;');
  expect(readFile(projectRoot, "src/frontend/css/page.scss")).toContain('@import "#frontend-core-legacy";');
  expect(readFile(projectRoot, "src/frontend/css/index.scss")).toContain('@forward "#frontend-core-palette";');
  expect(readJson(projectRoot, "package.json").imports).toMatchObject({
    "#frontend-core-legacy": "./src/frontend/core/_legacy.scss",
    "#frontend-core-palette": "./src/frontend/core/_palette.scss",
  });

  expect((await syncImports({ ...syncScssOptions(projectRoot), fix: false })).ok).toBe(true);
});

test("ignores SCSS url values, comments, and arbitrary strings during sync-imports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "src/frontend/css/page.scss", `
// @use "../core/palette";
/* @forward "../core/palette"; */
@import url("../core/palette");

$copy: '@use "../core/palette" as palette;';

.page {
  background: url("../core/palette");
  content: "@forward '../core/palette'";
}
`);
  writeFile(projectRoot, "src/frontend/core/_palette.scss", "$brand: #336699;\n");

  const result = await syncImports({
    projectRoot,
    fix: true,
    alias: { strategy: "relative-path-slug" },
    allowRelative: [],
  });

  expect(result.ok).toBe(true);
  expect(result.rewritten_files).toBe(0);
  expect(result.rewritten_imports).toBe(0);
  expect(readFile(projectRoot, "src/frontend/css/page.scss")).toContain('@import url("../core/palette");');
  expect(readFile(projectRoot, "src/frontend/css/page.scss")).toContain('$copy: \'@use "../core/palette" as palette;\';');
});

test("reports and restores generated package imports for SCSS aliases", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "package.json", JSON.stringify({ name: "scss-import-map" }, null, 2));
  writeFile(projectRoot, "tsconfig.json", "{}\n");
  writeFile(projectRoot, "src/frontend/css/page.scss", '@use "../core/palette" as palette;\n.page { color: palette.$brand; }\n');
  writeFile(projectRoot, "src/frontend/core/_palette.scss", "$brand: #336699;\n");

  await syncImports({ ...syncScssOptions(projectRoot), fix: true });
  const packageJson = readJson(projectRoot, "package.json");
  delete packageJson.imports["#frontend-core-palette"];
  writeFile(projectRoot, "package.json", JSON.stringify(packageJson, null, 2));

  const checkResult = await syncImports({ ...syncScssOptions(projectRoot), fix: false });
  expect(checkResult.ok).toBe(false);
  expect(checkResult.violations).toContainEqual(expect.objectContaining({
    filePath: "package.json",
    message: "package.json imports are out of sync with tsconfig paths",
  }));

  await syncImports({ ...syncScssOptions(projectRoot), fix: true });
  expect(readJson(projectRoot, "package.json").imports["#frontend-core-palette"]).toBe("./src/frontend/core/_palette.scss");
});
