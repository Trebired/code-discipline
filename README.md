# @trebired/code-discipline

Configurable repository discipline checks, structural fixes, and import syncing for Bun and Node.js projects.

`@trebired/code-discipline` is intentionally focused. It helps you keep a source tree disciplined without turning into a full linter, formatter, or build system.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/code-discipline
```

## Why This Package

Some repository rules are not really single-file lint rules. They are about the shape of the tree:

- files growing too large
- compound filenames that want to become folders
- alias drift between `tsconfig.json` and source imports
- blocking or warning on repository policy in CI or startup flows

That is the lane of this package.

## Commands

```sh
code-discipline check
code-discipline sync
code-discipline fix
```

Command responsibilities stay clean:

- `check`: read-only validation and logging
- `sync`: import and `tsconfig.json` synchronization only
- `fix`: explicit folderization moves only

Both `sync` and `fix` are gated by rule config. They do not mutate anything unless their rule has `fix: true`.

## Config

Every rule uses the same control model:

```txt
enabled
= whether the rule runs

stop
= whether violations fail the result / exit non-zero

fix
= whether explicit mutation commands may change files
```

Example `code-discipline.config.json`:

```json
{
  "sourceRoot": "src",
  "sourceExtensions": [
    ".ts",
    ".tsx",
    ".js",
    ".jsx"
  ],
  "excludeDirs": [
    "node_modules",
    "dist",
    ".vite"
  ],
  "rules": {
    "maxFileLines": {
      "enabled": true,
      "stop": true,
      "max": 500
    },
    "folderizeCompoundFiles": {
      "enabled": true,
      "stop": true,
      "fix": false,
      "separators": [
        "_",
        "-"
      ]
    },
    "syncImports": {
      "enabled": true,
      "stop": true,
      "fix": true,
      "alias": {
        "strategy": "relative-path-slug"
      },
      "allowRelative": [
        "./"
      ]
    }
  }
}
```

Breaking cleanup in `1.0.0`:

- `severity` was removed
- `suffixes` was removed
- `keepRelative` was replaced by `allowRelative`
- nested `syncImports.imports` was removed
- `rewrite` was removed as a config flag because `fix` controls mutation

## Checks

`checkCodeDiscipline()` is read-only. It never moves files, rewrites imports, or updates `tsconfig.json`.

```ts
import { checkCodeDiscipline } from "@trebired/code-discipline";

const result = await checkCodeDiscipline({
  projectRoot: "/repo",
  rules: {
    maxFileLines: {
      enabled: true,
      stop: true,
      max: 500,
    },
    folderizeCompoundFiles: {
      enabled: true,
      stop: false,
      separators: ["_", "-"],
    },
    syncImports: {
      enabled: true,
      stop: true,
      fix: false,
      alias: {
        strategy: "relative-path-slug",
      },
      allowRelative: ["./"],
    },
  },
});
```

Result shape:

```ts
{
  ok: boolean;
  warnings: number;
  failures: number;
  violations: Array<{
    rule: "max-file-lines" | "folderize-compound-files" | "sync-imports";
    stop: boolean;
    fix: boolean;
    filePath: string;
    message: string;
    details: Record<string, unknown>;
    suggestedPath?: string;
  }>;
}
```

## Folderization

`folderizeCompoundFiles` is structural. It no longer depends on configured suffix lists.

Same-directory groups:

```txt
src/api/user_route.ts
src/api/user_schema.ts
src/api/user_controller.ts
```

suggest:

```txt
src/api/user/route.ts
src/api/user/schema.ts
src/api/user/controller.ts
```

Repeated folder-prefix files are also detected:

```txt
src/api/user/user_route.ts
```

suggests:

```txt
src/api/user/route.ts
```

`check` only reports these candidates.

`fix` may apply them only when `folderizeCompoundFiles.fix` is `true`, and it rewrites affected relative imports after the move.

## Import Sync

`syncImports()` and `code-discipline sync` use one flat `syncImports` config.

```ts
import { syncImports } from "@trebired/code-discipline";

const result = await syncImports({
  projectRoot: "/repo",
  fix: true,
  alias: {
    strategy: "relative-path-slug",
  },
  allowRelative: ["./"],
});
```

Behavior:

- `check` reports import-policy drift in read-only mode
- `sync` rewrites imports and updates `tsconfig.json` only when `syncImports.fix` is `true`
- `allowRelative: ["./"]` keeps same-folder relative imports
- upward relative imports can be reported or rewritten through the configured alias policy

## Logging

When you provide a logger, discipline results are emitted through it. Trebired-style loggers are supported directly, and the package falls back safely when no logger is provided.

The default/common logger adaptation path is powered by `@trebired/logger-adapter`, while `logging.adapter(event)` remains available when you want exact control over the emitted event shape.

## Public API

- `checkCodeDiscipline()`
- `fixCodeDiscipline()`
- `syncImports()`
- `defineCodeDisciplineConfig()`
- `loadCodeDisciplineConfig()`

The package also exports the public TypeScript types for rule config, results, violations, alias strategies, logging adapters, and source scan rows.
