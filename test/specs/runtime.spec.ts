import { describe, expect, test } from "bun:test";

import { codeDiscipline, createCodeDiscipline } from "../../src/index.js";
import { captureTrebiredLogger, readFile, tempProject, writeFile } from "./helpers.js";

describe("code-discipline runtime api", () => {
  test("dispatches check through one package-owned entrypoint", async () => {
    const projectRoot = tempProject();

    writeFile(projectRoot, "src/too-long.ts", "one\n2\n3\n");

    const result = await codeDiscipline({
      mode: "check",
      projectRoot,
      rules: {
        maxFileLines: {
          max: 2,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toBe(1);
    expect(result.violations[0]?.rule).toBe("max-file-lines");
  });

  test("startup aliases sync and accepts logger shorthand", async () => {
    const projectRoot = tempProject();
    const { logger, rows } = captureTrebiredLogger();

    writeFile(projectRoot, "tsconfig.json", "{}\n");
    writeFile(projectRoot, "src/feature/app.ts", 'import { util } from "../shared/util";\nexport { util };\n');
    writeFile(projectRoot, "src/shared/util.ts", "export const util = true;\n");

    const discipline = createCodeDiscipline({
      sourceRoot: "src",
      rules: {
        syncImports: {
          severity: "error",
          fix: true,
          alias: {
            strategy: "relative-path-slug",
          },
          allowRelative: ["./"],
        },
      },
    });

    const result = await discipline.startup({
      projectRoot,
      logger,
    });

    expect(result.ok).toBe(true);
    expect(result.mutations_allowed).toBe(true);
    expect(readFile(projectRoot, "src/feature/app.ts")).toContain('from "#shared-util"');
    expect(rows.length).toBeGreaterThan(0);
  });
});
