# @trebired/code-discipline

Configurable codebase discipline checks and import syncing for Bun and Node.js projects.

`@trebired/code-discipline` scans a configured source tree, runs project-level discipline rules, and can also keep TypeScript path aliases plus source imports aligned in one package.

The package is intentionally focused. It helps with repository structure rules, file-shape rules, and import hygiene. It does not try to be a full linter, formatter, or build system.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/code-discipline
```

## Quick Start

```ts
import { checkCodeDiscipline } from "@trebired/code-discipline";

const result = await checkCodeDiscipline({
  projectRoot: "/repo",
  sourceRoot: "src",
  rules: {
    maxFileLines: {
      enabled: true,
      max: 500,
    },
    folderizeCompoundFiles: {
      enabled: true,
      suffixes: ["start", "service"],
      separators: ["_", "-"],
    },
  },
});

if (!result.ok) {
  console.error(result.violations);
  process.exit(1);
}
```

The first public slice is intentionally small:

- `checkCodeDiscipline()`
- `syncImports()`
- `defineCodeDisciplineConfig()`
- `loadCodeDisciplineConfig()`

If you want repo-driven usage instead of embedding the API directly, use the CLI with a top-level config file:

```sh
code-discipline check
code-discipline sync
```

## What This Package Checks

The first discipline layer is intentionally narrow:

- `maxFileLines`
- `folderizeCompoundFiles`

`maxFileLines` reports files whose physical line count exceeds a configured threshold.

`folderizeCompoundFiles` reports names such as `user_start.ts` or `user-start.ts` that could be grouped into a more structured path such as `user/start.ts`.

Example:

```ts
import { checkCodeDiscipline } from "@trebired/code-discipline";

const result = await checkCodeDiscipline({
  projectRoot: "/repo",
  rules: {
    maxFileLines: {
      enabled: true,
      max: 500,
      severity: "error",
    },
    folderizeCompoundFiles: {
      enabled: true,
      suffixes: ["start"],
      separators: ["_", "-"],
      severity: "warn",
    },
  },
});
```

The result shape stays simple:

```ts
{
  ok: boolean;
  warnings: number;
  errors: number;
  violations: Array<{
    rule: "max-file-lines" | "folderize-compound-files";
    severity: "warn" | "error";
    filePath: string;
    message: string;
    details: Record<string, unknown>;
    suggestedPath?: string;
  }>;
}
```

Checks are read-only. They report problems and let the caller decide whether to fail startup, fail CI, or only warn.

## CLI And Config

The CLI is meant for repository-owned discipline rules:

```sh
code-discipline check
code-discipline sync
```

Both commands accept `--config <path>`. When that flag is omitted, the CLI looks for `code-discipline.config.json` in the current working directory.

Example config:

```json
{
  "sourceRoot": "src",
  "rules": {
    "maxFileLines": {
      "enabled": true,
      "max": 500
    },
    "folderizeCompoundFiles": {
      "enabled": true,
      "suffixes": ["start", "service"],
      "separators": ["_", "-"]
    },
    "syncImports": {
      "alias": {
        "strategy": "relative-path-slug"
      }
    }
  }
}
```

`check` is read-only. It reports violations and exits non-zero when any error-severity rule fails.

`sync` is the mutating import-alignment command. It updates `compilerOptions.paths` and rewrites eligible source imports.

In practice:

- use JSON config plus the CLI when the rules belong to the repo
- use the API when another tool wants to control configuration or reporting dynamically

## Import Sync

`syncImports()` remains a first-class part of the package. It scans source files, generates aliases, preserves still-valid alias ids, writes stable `compilerOptions.paths` output, and rewrites eligible relative imports to those aliases.

```ts
import { syncImports } from "@trebired/code-discipline";

const result = await syncImports({
  projectRoot: "/repo",
  sourceRoot: "src",
  tsconfigPath: "/repo/tsconfig.json",
});
```

Default behavior:

- `sourceRoot: "src"`
- `tsconfigPath: "<projectRoot>/tsconfig.json"`
- `sourceExtensions: [".ts", ".tsx", ".js", ".jsx"]`
- `excludeDirs: ["node_modules", "dist", ".vite"]`
- `imports.rewrite: true`
- `imports.keepRelative: ["./"]`
- `alias.prefix: "#"`
- `alias.strategy: "random"`
- `alias.randomLength: 12`

By default, same-directory imports such as `./local` stay relative. Imports that walk upward, such as `../shared/util`, are eligible for rewrite when they resolve to a file under the configured source root.

Alias strategies:

- `"random"`
- `"relative-path-slug"`
- `"relative-path-hash"`
- custom function

Example custom strategy:

```ts
await syncImports({
  projectRoot: "/repo",
  alias: {
    strategy(input) {
      return `@${input.relativeFromSourceRoot.replace(/\//g, "__")}`;
    },
  },
});
```

If a custom strategy returns an invalid id or a duplicate id, the package fails clearly instead of guessing a fallback.

## Why This Package

Many repository rules are awkward in a single-file linter pass because they are really about the shape of a source tree, not only one file at a time.

This package is a better fit when you want checks such as:

- file-size limits across a configured source root
- filename patterns that imply a cleaner folder layout
- path alias synchronization across many files
- startup, CI, or pre-build gates based on repository conventions

It is intentionally repo-oriented. The package does one lane of work: codebase discipline plus import alignment.

## Current API

- `checkCodeDiscipline()`
- `defineCodeDisciplineConfig()`
- `loadCodeDisciplineConfig()`
- `syncImports()`
- `scanSourceFiles()`
- `syncTsconfigAliases()`
- `rewriteSourceImports()`
- `resolveRelativeImport()`
- `createRandomAlias()`
- `createRelativePathHashAlias()`
- `createRelativePathSlugAlias()`

The package also exports the public TypeScript types for options, results, violations, alias strategies, keep-relative callbacks, log events, and source scan rows.

## What This Package Does Not Do

- it does not build or compile TypeScript
- it does not move files automatically for folderization violations
- it does not rewrite emitted build output
- it does not depend on ESLint
- it does not assume a framework-specific runtime layout
