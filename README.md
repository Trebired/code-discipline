# @trebired/code-discipline

Configurable repository discipline checks and rule-driven fixes for Bun and Node.js projects.

`@trebired/code-discipline` stays in one lane:

- code shape rules such as max lines per file or function
- structural rules such as folderizing compound files
- sync rules such as keeping source imports, `tsconfig.json`, and optional `package.json#imports` aligned
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
code-discipline fix sync-imports dry
```

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
    "discipline:fix": "code-discipline fix"
  }
}
```

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

Example `tb.code-discipline.ts`:

```ts
import { defineCodeDisciplineConfig } from "@trebired/code-discipline";

export default defineCodeDisciplineConfig({
  sourceRoot: "src",
  sourceExtensions: [".go", ".rs"],
  excludeDirs: {
    dirs: ["coverage"],
    gitignore: true,
  },
  tsconfigPaths: {
    normalize: "relative-dot-prefix",
    restoreAfterRun: true,
  },
  lifecycle: {
    async beforeRun(context) {
      context.state.started = true;
    },
  },
  rules: {
    maxFileLines: {
      max: 500,
    },
    maxFunctionLines: {
      max: 80,
    },
    folderizeCompoundFiles: {
      separators: ["_", "-"],
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

Source scanning stays additive by default:

- built-in source extensions are included unless `includeDefaultSourceExtensions: false`
- built-in excluded directories are always included
- root `.gitignore` directory entries are included only when `excludeDirs.gitignore: true`

So you can extend the defaults without having to repeat the generated-folder list inline.

Example scan configuration:

```ts
export default defineCodeDisciplineConfig({
  sourceRoot: "src",

  // Add extra file types on top of the built-in JS/TS set.
  sourceExtensions: [".go", ".rs"],

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
code-discipline fix sync-imports dry
```

Rules use kebab-case public slugs:

- `max-file-lines`
- `max-function-lines`
- `folderize-compound-files`
- `sync-imports`
- `dry`

`fix` only accepts fixable rules. Trying to run `code-discipline fix max-function-lines` fails clearly.

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

### `maxFileLines`

Reports files whose total line count exceeds `max`.

### `maxFunctionLines`

Reports function-like declarations whose total span exceeds `max`.

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
