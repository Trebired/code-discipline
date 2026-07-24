import { expect, test } from "bun:test";

import { checkCodeDiscipline, loadResolvedCodeDisciplineConfig } from "../../src/index.js";
import { tempProject, writeFile } from "./helpers.js";

test("rejects removed enabled keys for line-limit rules", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        // @ts-expect-error legacy config
        enabled: true,
        max: 5,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFunctionLines: {
        // @ts-expect-error legacy config
        enabled: true,
        max: 5,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects empty bannedPatterns config", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      bannedPatterns: {
        patterns: [],
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects empty bannedFiles config", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      bannedFiles: {
        patterns: [],
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects removed logging boolean config", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    logging: {
      // @ts-expect-error removed config
      enabled: true,
    },
    rules: {
      maxFileLines: {
        max: 5,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      syncImports: {
        logging: {
          // @ts-expect-error removed config
          quiet: false,
        },
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects invalid severity values", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      maxFileLines: {
        max: 5,
        // @ts-expect-error invalid severity
        severity: "error",
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects non-array removeComments.exclude values", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      removeComments: {
        // @ts-expect-error invalid exclude
        exclude: "@ts-nocheck",
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects invalid dry minDuplicateCharacters values", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        // @ts-expect-error invalid min
        minDuplicateCharacters: "300",
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects removed sourceExtensions config in favor of excludeSourceExtensions", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    // @ts-expect-error legacy config
    sourceExtensions: [".ts"],
    rules: {
      maxFileLines: {
        max: 5,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects removed evasionGuards config", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    // @ts-expect-error removed config
    evasionGuards: true,
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("loads TypeScript config modules with relative local imports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/config-helper.ts", [
    "export function defineLocalConfig(value: unknown) {",
    "  return value;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "code-discipline.ts", [
    "import { defineLocalConfig } from \"./src/config-helper.js\";",
    "",
    "export default defineLocalConfig({",
    "  sourceRoot: \"src\",",
    "  rules: {",
    "    maxFileLines: { max: 10 },",
    "  },",
    "});",
    "",
  ].join("\n"));

  const loaded = await loadResolvedCodeDisciplineConfig(projectRoot);

  expect(loaded.config).toEqual({
    sourceRoot: "src",
    rules: {
      maxFileLines: {
        max: 10,
      },
    },
  });
});

test("rejects removed keys for folderizeCompoundFiles", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {
        // @ts-expect-error legacy config
        stop: true,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      folderizeCompoundFiles: {
        // @ts-expect-error stale config
        fix: true,
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("rejects removed enabled and fix keys for syncImports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      syncImports: {
        // @ts-expect-error legacy config
        enabled: true,
        alias: {
          strategy: "relative-path-slug",
        },
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      syncImports: {
        // @ts-expect-error stale config
        fix: true,
        alias: {
          strategy: "relative-path-slug",
        },
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});
