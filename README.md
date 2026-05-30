# code-discipline

Configurable codebase discipline checks and import syncing for Bun and Node.js projects.

`code-discipline` adds project-level checks that can block dev, start, or CI when codebase rules are violated, and it includes import alias syncing as one of its features.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install code-discipline
```

## Quick Start

```ts
import { checkCodeDiscipline } from "code-discipline";

const result = await checkCodeDiscipline({
  projectRoot: "/repo",
  rules: {
    maxFileLines: {
      enabled: true,
      max: 500,
    },
    folderizeCompoundFiles: {
      enabled: true,
    },
  },
});

if (!result.ok) {
  console.error(result.violations);
  process.exit(1);
}
```

## Features

- run read-only discipline checks across a configured source tree
- fail or warn when a source file exceeds a configured line limit
- detect compound filenames such as `user_start.ts` or `user-start.ts` that could be grouped as `user/start.ts`
- sync `compilerOptions.paths` aliases from source files
- rewrite relative imports, re-exports, dynamic imports, and import-type references to those aliases

## CLI

```sh
code-discipline check
code-discipline sync
```

Both commands accept `--config <path>`. By default, the CLI looks for `code-discipline.config.json` in the current working directory.

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

## Library APIs

### `checkCodeDiscipline()`

Use `checkCodeDiscipline()` to run configured read-only rules:

```ts
import { checkCodeDiscipline } from "code-discipline";

const result = await checkCodeDiscipline({
  projectRoot: "/repo",
  sourceRoot: "src",
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

Result shape:

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

### `syncImports()`

`syncImports()` remains available as the mutating import-sync feature:

```ts
import { syncImports } from "code-discipline";

const result = await syncImports({
  projectRoot: "/repo",
  sourceRoot: "src",
  tsconfigPath: "/repo/tsconfig.json",
});
```

Default sync settings:

- `sourceRoot: "src"`
- `tsconfigPath: "<projectRoot>/tsconfig.json"`
- `sourceExtensions: [".ts", ".tsx", ".js", ".jsx"]`
- `excludeDirs: ["node_modules", "dist", ".vite"]`
- `imports.rewrite: true`
- `imports.keepRelative: ["./"]`
- `alias.prefix: "#"`
- `alias.strategy: "random"`
- `alias.randomLength: 12`

Alias strategies:

- `"random"`
- `"relative-path-slug"`
- `"relative-path-hash"`
- custom function

## What The Package Does Not Do

- it does not build or compile TypeScript
- it does not move files automatically for folderization violations
- it does not rewrite emitted build output
- it does not depend on ESLint
- it does not assume a framework-specific runtime layout

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
