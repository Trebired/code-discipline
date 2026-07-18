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

test("loads TypeScript config modules with relative local imports", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/config-helper.ts", [
    "export function defineLocalConfig(value: unknown) {",
    "  return value;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "tb.code-discipline.ts", [
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

test("rejects removed fix keys for dry", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        // @ts-expect-error stale config
        fix: true,
        helpers: [
          {
            from: "./src/shared/to-text.ts",
            exportName: "toText",
          },
        ],
      },
    },
  })).rejects.toMatchObject({
    code: "invalid_config",
  });
});

test("reports DRY duplicates despite renamed parameters and comments", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/shared/to-text.ts", [
    "export function toText(value: unknown) {",
    "  return String(value == null ? \"\" : value).trim();",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/app.ts", [
    "export function clean(input: unknown) {",
    "  // normalize the text",
    "  return String(input == null ? \"\" : input).trim();",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        helpers: [
          {
            from: "./src/shared/to-text.ts",
            exportName: "toText",
          },
        ],
      },
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violations).toHaveLength(1);
  expect(result.violations[0]).toMatchObject({
    rule: "dry",
    filePath: "src/app.ts",
    details: {
      fixable: true,
      helper: "./src/shared/to-text.ts#toText",
    },
  });
});

test("reports likely DRY duplicates discovered across source files", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/one.ts", [
    "export function buildUserLabel(user: { name?: string; email?: string }) {",
    "  const name = String(user.name ?? \"\").trim();",
    "  const email = String(user.email ?? \"\").trim();",
    "  const normalizedName = name.replace(/\\s+/g, \" \");",
    "  const normalizedEmail = email.toLowerCase();",
    "  const domain = normalizedEmail.includes(\"@\") ? normalizedEmail.split(\"@\")[1] : \"\";",
    "  return domain ? `${normalizedName} <${normalizedEmail}>` : normalizedEmail;",
    "}",
    "",
  ].join("\n"));
  writeFile(projectRoot, "src/two.ts", [
    "export function formatAccountLabel(account: { name?: string; email?: string }) {",
    "  const displayName = String(account.name ?? \"\").trim();",
    "  const contact = String(account.email ?? \"\").trim();",
    "  const readableName = displayName.replace(/\\s+/g, \" \");",
    "  const readableContact = contact.toLowerCase();",
    "  const contactDomain = readableContact.includes(\"@\") ? readableContact.split(\"@\")[1] : \"\";",
    "  return contactDomain ? `${readableName} <${readableContact}>` : readableContact;",
    "}",
    "",
  ].join("\n"));

  const result = await checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {},
    },
  });

  expect(result.ok).toBe(false);
  expect(result.violationCount).toBe(1);
  expect(result.violations[0]).toMatchObject({
    rule: "dry",
    fix: false,
    filePath: "src/two.ts",
    details: {
      fixable: false,
      reason: "source duplicate requires a canonical helper for autofix",
      duplicateOf: {
        filePath: "src/one.ts",
        name: "buildUserLabel",
      },
    },
  });
});

test("fails clearly when a DRY helper export cannot be resolved", async () => {
  const projectRoot = tempProject();

  writeFile(projectRoot, "src/shared/to-text.ts", "export const value = 1;\n");
  writeFile(projectRoot, "src/app.ts", "export const app = true;\n");

  await expect(checkCodeDiscipline({
    projectRoot,
    rules: {
      dry: {
        helpers: [
          {
            from: "./src/shared/to-text.ts",
            exportName: "toText",
          },
        ],
      },
    },
  })).rejects.toThrow("dry helper export is not a supported function");
});
