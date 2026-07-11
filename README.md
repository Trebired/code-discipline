# @trebired/code-discipline

Configurable repository discipline checks and rule-driven fixes for Bun and Node.js projects.

`@trebired/code-discipline` stays in one lane:

- code shape rules such as max lines per file or function
- structural rules such as folderizing compound files
- sync rules such as keeping source imports, `tsconfig.json`, and optional `package.json#imports` aligned
- source cleanup rules such as removing comments across supported languages
- native acceleration with a TypeScript fallback for large codebases
- DRY enforcement against registered canonical helper functions

It is not a formatter, linter replacement, or build system.

## Install

Runtime support:

- Bun 1+
- Node.js 18+

```sh
npm install @trebired/code-discipline
```

## Commands

```sh
code-discipline check
code-discipline check save
code-discipline check max-function-lines dry
code-discipline fix
code-discipline fix sync-imports dry remove-comments
code-discipline gate -- bun run dev
```

## Native Backend

`@trebired/code-discipline` can use a Rust native backend when a matching binary is available, with the TypeScript implementation as the fallback. This follows the same native-fast-path shape as `@trebired/logger`: package users keep the same CLI/API, while hot scanning and rewrite paths can move into Rust.

The current native backend accelerates source scanning, `max-file-lines`, common `max-function-lines` paths, `folderize-compound-files` checks, `remove-comments`, and `evasion-guards`. If no binary is present, the package automatically uses the TypeScript fallback.

Useful native controls:

- `bun run build:native` builds the host native addon into `native/<platform>.node`
- `bun run build:native:matrix` builds the release target matrix
- `TB_CODE_DISCIPLINE_DISABLE_NATIVE=1` forces the TypeScript fallback
- `TB_CODE_DISCIPLINE_NATIVE_BINARY=/path/to/addon.node` loads a specific native addon

Top-level `sync` is gone.

`sync-imports` is now just another fixable rule, so targeted sync work is done through:

```sh
code-discipline fix sync-imports
```

If you want the terminal output written to a top-level file too, add `save`:

```sh
code-discipline check save
```

This writes a plain-text report to a timestamped file such as `cd-report-2026-05-26-19-00-00.txt`.

Typical `package.json` scripts can stay simple:

```json
{
  "scripts": {
    "discipline:check": "code-discipline check",
    "discipline:fix": "code-discipline fix",
    "start:app": "node dist/server.js",
    "start": "code-discipline gate -- npm run start:app"
  }
}
```

`gate` runs the same repo config discovery as `check`. If violations are found, it exits non-zero and does not launch the child command. If the repo is clean, it starts the child command and forwards its exit status.

## Config

The CLI auto-discovers a top-level config module in this order:

- `tb.code-discipline.ts`
- `tb.code-discipline.mts`
- `tb.code-discipline.mjs`
- `tb.code-discipline.js`
- `tb.code-discipline.cts`
- `tb.code-discipline.cjs`

`tb.code-discipline.ts` is the recommended default.

You can still point at an explicit module path:

```sh
code-discipline check --config ./discipline.config.mjs
```

Legacy config filenames are no longer auto-discovered, but they still work when passed explicitly with `--config`.

Rules are enabled by presence. If a rule object exists under `rules`, it runs.

Rule severity is optional and now supports only `severity: "warning" | "fail"`. If omitted, the default is `fail`.

`evasionGuards` is a top-level opt-in system because it checks suspicious compliance patterns across rules instead of being a normal style rule.

Example `tb.code-discipline.ts`:

```ts
import { defineCodeDisciplineConfig } from "@trebired/code-discipline";

export default defineCodeDisciplineConfig({
  sourceRoot: "src",
  excludeSourceExtensions: [".scss"],
  excludeDirs: {
    dirs: ["coverage"],
    gitignore: true,
  },
  tsconfigPaths: {
    normalize: "relative-dot-prefix",
    restoreAfterRun: true,
  },
  evasionGuards: true,
  lifecycle: {
    async beforeRun(context) {
      context.state.started = true;
    },
  },
  rules: {
    maxFileLines: {
      max: 500,
      severity: "warning",
    },
    maxFunctionLines: {
      max: 80,
      severity: "warning",
    },
    folderizeCompoundFiles: {
      separators: ["_", "-"],
    },
    removeComments: {
      exclude: ["@ts-nocheck"],
    },
    syncImports: {
      alias: {
        prefix: "#",
        strategy: "relative-path-slug",
      },
      allowRelative: ["./"],
      packageJsonImports: {
        enabled: true,
        aliasPrefix: "#",
      },
    },
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
```

Source scanning covers every built-in supported source family by default:

- exclude specific extensions with `excludeSourceExtensions`
- built-in excluded directories are always included
- root `.gitignore` directory entries are included only when `excludeDirs.gitignore: true`

So you get the full supported scan set automatically and only opt out when needed.

Example scan configuration:

```ts
export default defineCodeDisciplineConfig({
  sourceRoot: "src",

  // Skip specific built-in file types when needed.
  excludeSourceExtensions: [".scss"],

  // Add extra ignored directories on top of the built-in set.
  excludeDirs: {
    dirs: ["coverage"],

    // Opt into reusing root .gitignore directory entries.
    gitignore: true,
  },

  rules: {
    maxFunctionLines: {
      max: 80,
    },
  },
});
```

## Rule Selectors

`check` and `fix` both accept positional rule selectors:

```sh
code-discipline check max-file-lines max-function-lines
code-discipline fix sync-imports dry remove-comments
```

Rules use kebab-case public slugs:

- `banned-patterns`
- `max-file-lines`
- `max-function-lines`
- `folderize-compound-files`
- `sync-imports`
- `remove-comments`
- `dry`
- `evasion-guards`

`fix` only accepts fixable rules. Trying to run `code-discipline fix max-function-lines` or `code-discipline fix evasion-guards` fails clearly.

## Runtime API

The package-owned runtime dispatcher now has two modes only:

- `check`
- `fix`

```ts
import { codeDiscipline } from "@trebired/code-discipline";

const result = await codeDiscipline({
  mode: "fix",
  projectRoot: process.cwd(),
  onlyRules: ["sync-imports"],
  rules: {
    syncImports: {
      alias: {
        strategy: "relative-path-slug",
      },
    },
  },
});
```

You can also bind config once:

```ts
import { createCodeDiscipline } from "@trebired/code-discipline";

const discipline = createCodeDiscipline({
  sourceRoot: "src",
  rules: {
    bannedPatterns: {
      patterns: [
        "test",
        {
          value: "mock",
          allowedFiles: ["src/testing/mock-registry.ts"],
        },
      ],
    },
    maxFunctionLines: {
      max: 80,
    },
    syncImports: {
      alias: {
        strategy: "relative-path-slug",
      },
    },
  },
});

await discipline.fix({
  projectRoot: process.cwd(),
  onlyRules: ["sync-imports"],
});
```

Every violation is treated uniformly now. Results expose `ok`, `violationCount`, and `violations`, and the CLI prints concise rule/file/message lines instead of large JSON-style payloads.

## Rules

### `bannedPatterns`

Reports case-insensitive substring matches found in source files.

- `"test"` matches `test`, `Test`, `contest`, and `"Test runner"`
- matching is content-based, not whole-word-only
- `allowedFiles` lets specific project-relative files bypass a specific banned pattern
- `severity` defaults to `"fail"`

Example:

```ts
bannedPatterns: {
  patterns: [
    "test",
    {
      value: "mock",
      allowedFiles: ["src/testing/mock-registry.ts"],
    },
  ],
}
```

### `maxFileLines`

Reports files whose total line count exceeds `max`.

### `maxFunctionLines`

Reports function-like declarations whose total span exceeds `max`.

### `evasionGuards`

Reports suspicious attempts to satisfy discipline rules without actually improving the code. This is mainly for AI agents because they commonly produce this type of shady slop: compressing long files or large functions into one-line/few-line code so max-line checks stop complaining.

Enable it at the top level:

```ts
export default defineCodeDisciplineConfig({
  evasionGuards: true,
  rules: {
    maxFileLines: {
      max: 500,
    },
    maxFunctionLines: {
      max: 80,
    },
  },
});
```

It detects:

- packed files with very few physical lines but lots of code structure
- packed lines with excessive statement or structural density
- packed JavaScript/TypeScript functions that dodge line-count limits
- runtime code hiding through string execution such as `eval`, `new Function`, or `setTimeout("code")`

`evasionGuards` is check-only and disabled unless explicitly configured.

### `folderizeCompoundFiles`

Detects flat compound names such as `user_route.ts` and can move them into structural folders such as `user/route.ts`.

The rule config only describes separators now. Whether it mutates is decided by running `code-discipline fix`.

Folderization autofix stays intentionally conservative: move-aware relative import repair is implemented for the JavaScript and TypeScript module family, while Go and Rust files are scanned safely for other rules but are not folderized automatically.

### `syncImports`

Validates and optionally fixes:

- `tsconfig.compilerOptions.paths`
- relative source imports that should become aliases
- optional `package.json#imports` drift through `packageJsonImports`

`syncImports` only rewrites JavaScript and TypeScript module files. Mixed-language repositories can still include Go and Rust under the same `sourceRoot`; those files are ignored by alias syncing instead of causing parser failures.

`excludeDirs` now groups scan exclusions in one place, so you can add explicit directories through `excludeDirs.dirs` and opt into root `.gitignore` directory entries through `excludeDirs.gitignore`.

Example:

```ts
excludeDirs: {
  dirs: ["coverage", "tmp"],
  gitignore: true,
},
```

Example targeted CLI usage:

```sh
code-discipline fix sync-imports
```

### `removeComments`

Reports files that still contain removable comments and strips them when you run `code-discipline fix`.

The rule supports the same language families this package currently scans for discipline work:

- JavaScript and TypeScript
- Go
- Rust
- SCSS

It keeps string, regex, rune, char, byte-string, and raw-string content intact while removing actual source comments. When a removed comment occupied the whole line, that empty line is removed in the same file rewrite.

You can preserve specific comments by matching plain substrings inside the comment text itself, without hardcoding any comment syntax:

```ts
removeComments: {
  exclude: ["@ts-nocheck"],
}
```

In that example, any comment containing `@ts-nocheck` is ignored by both `check` and `fix`.

Example targeted CLI usage:

```sh
code-discipline fix remove-comments
```

### `dry`

Registers canonical helper functions and reports exact normalized duplicates.

The first version is intentionally conservative:

- matching is exact normalized structure, not heuristic similarity
- whitespace, comments, function names, and local identifier names do not matter
- class/object methods are report-only
- autofix only runs when the duplicate can be removed completely and replaced by a canonical import

Canonical helpers are registered by module export reference:

```ts
dry: {
  helpers: [
    {
      from: "./src/shared/to-text.ts",
      exportName: "toText",
    },
    {
      from: "./src/shared/normalize.ts",
      exportName: "default",
    },
  ],
}
```

Supported canonical helper exports:

- exported function declarations
- exported const bindings initialized with function expressions or arrow functions
- default exports of those function shapes

## Lifecycle Hooks

Hooks remain package-owned and generic:

- `beforeRun(context)`
- `afterRun(context, result)`
- `beforeMode(context)`
- `afterMode(context, result)`

The hook context includes:

- `mode`
- `projectRoot`
- `configPath`
- `config`
- mutable `state`

## Tsconfig Path Normalization

Use `tsconfigPaths` when a run needs temporary `compilerOptions.paths` normalization:

```ts
tsconfigPaths: {
  normalize: "relative-dot-prefix",
  restoreAfterRun: true,
}
```

Available modes:

- `"relative-dot-prefix"` turns `src/x.ts` into `./src/x.ts`
- `"strip-dot-prefix"` turns `./src/x.ts` into `src/x.ts`
- `"none"` leaves values unchanged

## Advanced Helpers

Low-level helpers are still exported for advanced tooling:

- `checkCodeDiscipline()`
- `fixCodeDiscipline()`
- `syncImports()`
- `defineCodeDisciplineConfig()`
- `findCodeDisciplineConfigModule()`
- `loadResolvedCodeDisciplineConfig()`
- `prepareTsconfigPaths()`
- `restoreTsconfigPaths()`
- `syncPackageJsonImportsFromTsconfigPaths()`

`syncImports()` remains available as a lower-level helper, but the package CLI no longer exposes a separate `sync` command.
