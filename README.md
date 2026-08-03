# @trebired/code-discipline

Configurable repository discipline checks and rule-driven fixes for Bun projects.

`@trebired/code-discipline` stays in one lane:

- code shape rules such as max lines per file or function
- structural rules such as folderizing compound files
- sync rules such as keeping source imports, `tsconfig.json`, and optional `package.json#imports` aligned
- source cleanup rules such as removing comments across supported languages
- structural spacing rules such as normalizing blank lines around JavaScript and TypeScript declarations
- native acceleration with a TypeScript fallback for large codebases
- DRY enforcement through source-tree duplicate function grouping

It is not a formatter, linter replacement, or build system.

## Install

Runtime support: Bun 1+.

```sh
bun i @trebired/code-discipline
```

## Quick Start

```sh
code-discipline check
code-discipline check save
code-discipline check max-function-lines dry
code-discipline fix
code-discipline fix banned-files min-file-lines max-characters-per-line imports remove-comments structural-blank-lines
code-discipline gate -- bun run dev
```

## Concepts

### Rules

#### `bannedPatterns`

Reports case-insensitive substring matches found in source files.

- `"test"` matches `test`, `Test`, `contest`, and `"Test runner"`
- matching is content-based, not whole-word-only
- `allowedFiles` lets specific project-relative files bypass a specific banned pattern
- `severity` defaults to `"fail"`
- for `.ts`/`.tsx`/`.mts`/`.cts`/`.js`/`.jsx`/`.mjs`/`.cjs` files, patterns are also checked against expressions the compiler can constant-fold to a fixed string at zero runtime cost: `+` concatenation of literals, template literals with foldable interpolations, `[...literals].join(literalSeparator)`, and same-scope `const` aliases of those  -  so `["OPER", "LORN"].join("")` is caught the same as the literal `"OPERLORN"` would be
- expressions touching anything non-literal (a parameter, `process.env`, a function call, a name shadowed elsewhere in the file) are never folded  -  this closes the "split into literal chunks" evasion without guessing at genuinely computed values

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

#### `bannedFiles`

Reports source files whose project-relative paths match banned glob patterns.

- `**/*.spec.ts` matches root and nested TypeScript spec files
- `*` matches within a single path segment
- `**` can cross directory boundaries
- `code-discipline fix banned-files` deletes matching files
- `severity` defaults to `"fail"`

Example:

```ts
bannedFiles: {
  patterns: [
    { glob: "**/*.spec.ts" },
    { glob: "**/*.spec.tsx" },
  ],
}
```

#### `maxFileLines`

Reports files whose total line count exceeds `max`.

#### `minFileLines`

Reports files whose code line count is at or below `min`, defaulting to `1` when the rule is configured. This catches tiny legacy compatibility shims that only re-export or re-import another module.

`code-discipline fix min-file-lines` can delete tiny redirect shims when the file is clearly a single JavaScript/TypeScript `export ... from "..."` statement or a single SCSS `@forward "..."` directive. Importers of that shim are rewritten to the forwarded target before the shim file is removed.

#### `minDeclarationName`

Reports JavaScript and TypeScript `function` declarations and simple `const` identifiers whose names are shorter than `min`, defaulting to `2` when the rule is configured.

#### `maxCharactersPerLine`

Reports physical lines whose character count exceeds `max`, defaulting to `150` when the rule is configured.

`code-discipline fix max-characters-per-line` can split safe JavaScript and TypeScript string literals into concatenated string segments without requiring Prettier. The fixer preserves the exact runtime string value, prefers whitespace split points, keeps the original quote style when practical, and handles common expression positions such as object property values, variable initializers, array elements, call arguments, and return statements.

Example:

```ts
const messages = {
  repositoryActionsDescription:
    "Akce jsou workflow vlastněná repozitářem, nalezená v {{dir}}. Starší shellová workflow stále fungují, zatímco úlohy, artefakty a běhy workflow_dispatch jsou podporovány také zde.",
};
```

Becomes:

```ts
const messages = {
  repositoryActionsDescription:
    "Akce jsou workflow vlastněná repozitářem, nalezená v {{dir}}. " +
    "Starší shellová workflow stále fungují, zatímco úlohy, artefakty " +
    "a běhy workflow_dispatch jsou podporovány také zde.",
};
```

Unsafe cases stay unchanged and remain reported after the fix pass. The fixer intentionally avoids template literals, escaped strings, strings with newlines, import/export specifiers, directive prologues, JSX text and attributes, URLs, long unbroken tokens, generated files, minified files, regex literals, comments, and syntax cases where semantic preservation is uncertain.

#### `maxFunctionLines`

Reports function-like declarations whose total span exceeds `max`.

JavaScript and TypeScript use the TypeScript AST. Go and Rust use brace-aware function scanning. Python uses indentation-aware `def` and `async def` spans. Shell files with `.sh`, `.bash`, or `.zsh` use quote/comment-aware brace function spans.

#### `folderizeCompoundFiles`

Detects flat compound names such as `user_route.ts` and can move them into structural folders such as `user/route.ts`.

The rule config only describes separators now. Whether it mutates is decided by running `code-discipline fix`.

Folderization autofix stays intentionally conservative: move-aware relative import repair is implemented for the JavaScript and TypeScript module family, while Go and Rust files are scanned safely for other rules but are not folderized automatically.

#### `imports`

Validates and optionally fixes:

- `tsconfig.compilerOptions.paths`
- relative source imports that should become aliases
- `project-manifests` output drift in root `tsconfig.json` and `package.json#imports`
- `alias-map` output drift in `.trebired/code-discipline/imports/*.json` and the generated tsconfig projection

`imports` rewrites JavaScript, TypeScript, and SCSS module specifiers. Mixed-language repositories can still include Go, Rust, Python, and extension-bearing shell files; those files are ignored by alias syncing instead of causing parser failures.

When `imports` sees a relative import that resolves nowhere, check mode reports it. Fix mode removes safe line-isolated static import/export declarations and Sass `@use`, `@forward`, or single-specifier quoted `@import` directives. Dynamic `import(...)`, comments, strings, CSS `url(...)`, and arbitrary CSS values are left alone.

Setting `removeDeadImports: true` also detects and removes unused JavaScript/TypeScript import bindings (default, namespace, and named specifiers, including `import type`). Detection is syntactic: a binding is dead when its local name has no other identifier reference anywhere else in the file. Side-effect-only imports (`import "./x"`) are never touched, and only the unused portion of a multi-binding import is removed, keeping the rest intact. This option is off by default.

The default `output: { type: "project-manifests" }` writes aliases directly into root `tsconfig.json` and mirrors them into `package.json#imports`. `output: { type: "alias-map" }` uses `.trebired/code-discipline/imports/*.json` as the alias source of truth, writes `.trebired/code-discipline/generated/tsconfig.paths.json`, makes root `tsconfig.json` extend the generated file, and removes managed project-manifest alias state. `code-discipline check imports` reports missing or stale generated tsconfig wiring as a fixable violation, and `code-discipline fix imports` migrates both directions when the configured output model changes.

Alias-map output separates committed state from disposable package output:

- commit `.trebired/code-discipline/config.ts`
- commit `.trebired/code-discipline/imports/*.json` when stable or random aliases are part of the configured alias-map state
- do not commit `.trebired/code-discipline/generated/`
- `code-discipline fix imports` creates root `.gitignore` when missing and adds `.trebired/code-discipline/generated/` idempotently
- saved CLI reports are written under `.trebired/code-discipline/generated/reports/`

Top-level `ignore` groups shared scan and formatter exclusions in one place, so you can add explicit entries through `ignore.entries` and opt into root `.gitignore` entries through `ignore.use_gitignore`.

Example:

```ts
ignore: {
  entries: [
    { type: "folder", pattern: "coverage" },
    { type: "folder", pattern: "tmp" },
  ],
  use_gitignore: true,
},
```

Example targeted CLI usage:

```sh
code-discipline fix imports
```

#### `removeComments`

Reports files that still contain removable comments and strips them when you run `code-discipline fix`.

The rule supports the same language families this package currently scans for discipline work:

- JavaScript and TypeScript
- Go
- Rust
- Python
- shell files with `.sh`, `.bash`, or `.zsh`
- SCSS and CSS

It keeps string, regex, rune, char, byte-string, raw-string, Python triple-string, shell quoted-string, and shell heredoc content intact while removing actual source comments. Python shebang and encoding comments are preserved, and shell shebangs are preserved. When a removed comment occupied the whole line, that empty line is removed in the same file rewrite.

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

#### `structuralBlankLines`

Reports JavaScript and TypeScript files where the major structural sections aren't visually separated, and normalizes the blank lines between them when you run `code-discipline fix`.

It only enforces blank lines at boundaries the AST clearly identifies as structural: after the file header, between imports and the first non-import statement, between declaration groups (variables, types, functions, classes, enums, namespaces), and between class fields/methods/constructors. Compact groups  -  consecutive imports, variables, type declarations, re-exports, top-level executable statements, class fields, directive prologues, function overload chains, and getter/setter pairs  -  allow zero or one blank line and only collapse two or more down to one.

It never touches statements inside function or method bodies, `if`/loop/`try` bodies, object literals, array elements, interface members, type literal members, enum members, or JSX children  -  spacing choices inside those remain up to the developer.

```ts
structuralBlankLines: {}
```

Example targeted CLI usage:

```sh
code-discipline fix structural-blank-lines
```

#### `dry`

Reports duplicate function groups across the configured source tree.

- exact normalized structure is reported with 100% confidence
- equivalent normalized behavior in simple pure functions is reported with 100% confidence
- matching function names are reported with 100% confidence
- highly similar normalized function structure is reported as a likely duplicate
- `minDuplicateCharacters` defaults to `0`; raise it if you only want larger duplicate functions
- whitespace, comments, function names, parameter names, and local identifier names do not matter
- expression bodies, single-return blocks, simple const-then-return blocks, nullish fallback forms, finite number guards, and object guard branches are normalized when their behavior matches
- reports are neutral groups, not "file A duplicates file B"
- `dry` is check-only

```ts
dry: {
  minDuplicateCharacters: 0,
}
```

Example output:

```txt
dry duplicate function group: 2 functions, confidence 1, signals: exact-normalized, normalized-behavior, similar-structure
  - src/one.ts:1 buildUserLabel
  - src/two.ts:1 formatUserLabel
```

### Lifecycle Hooks

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

### Tsconfig Path Normalization

Use `rules.imports.runtime` when a run needs temporary `compilerOptions.paths` normalization:

```ts
rules: {
  imports: {
    runtime: {
      normalize: "relative-dot-prefix",
      restoreAfterRun: true,
    },
  },
}
```

Available modes:

- `"relative-dot-prefix"` turns `src/x.ts` into `./src/x.ts`
- `"strip-dot-prefix"` turns `./src/x.ts` into `src/x.ts`
- `"none"` leaves values unchanged

## Configuration

### Config

The CLI auto-discovers config modules in this order:

- `.trebired/code-discipline/config.ts`

That is the only auto-discovered config filename.

You can still point at an explicit module path:

```sh
code-discipline check --config ./discipline.config.mjs
```

Other config filenames are not auto-discovered, but they still work when passed explicitly with `--config`.

Rules are enabled by presence. If a rule object exists under `rules`, it runs.

Rule severity is optional and now supports only `severity: "warning" | "fail"`. If omitted, the default is `fail`.

Example `.trebired/code-discipline/config.ts`:

```ts
import { defineCodeDisciplineConfig } from "@trebired/code-discipline";

export default defineCodeDisciplineConfig({
  excludeSourceExtensions: [".scss"],
  ignore: {
    entries: [
      { type: "folder", pattern: "coverage" },
      { type: "file", pattern: "**/*.client.ts" },
      { type: "file", pattern: "*.min.js" },
      { type: "file", pattern: "*.min.css" },
    ],
    use_gitignore: true,
  },
  lifecycle: {
    async beforeRun(context) {
      context.state.started = true;
    },
  },
  logging: {
    warnings: true,
  },
  presets: {
    nodeProcessBoundary: {
      envBoundaryFiles: ["src/backend/core/env.ts"],
      processBoundaryFiles: [
        "src/backend/shared/process/index.ts",
        "src/backend/shared/process/cjs.cjs",
      ],
    },
  },
  formatters: {
    prettier: {
      ignore: true,
      options: {
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
        semi: true,
        singleQuote: true,
        trailingComma: "all",
        endOfLine: "lf",
      },
    },
  },
  rules: {
    minFileLines: {
      min: 1,
      excludeDirs: [
        { type: "file", pattern: "**/*.client.ts" },
      ],
    },
    minDeclarationName: {
      min: 2,
    },
    maxFileLines: {
      max: 500,
      severity: "warning",
    },
    maxCharactersPerLine: {
      max: 150,
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
    bannedFiles: {
      patterns: [
        { glob: "**/*.spec.ts" },
        { glob: "**/*.spec.tsx" },
      ],
    },
    imports: {
      alias: {
        prefix: "#",
        strategy: "relative-path-slug",
      },
      allowRelative: ["./"],
      output: {
        type: "alias-map",
        maxEntriesPerFile: 1000,
      },
      runtime: {
        normalize: "relative-dot-prefix",
        restoreAfterRun: true,
      },
    },
    dry: {
      minDuplicateCharacters: 0,
    },
  },
});
```

Source scanning covers every built-in supported source family by default:

- exclude specific extensions with `excludeSourceExtensions`
- built-in excluded directories are always included
- top-level `ignore.entries` and root `.gitignore` entries are included when `ignore.use_gitignore: true`

So you get the full supported scan set automatically and only opt out when needed.

Example scan configuration:

```ts
export default defineCodeDisciplineConfig({
  // Skip specific built-in file types when needed.
  excludeSourceExtensions: [".scss"],

  // Add extra ignored entries on top of the built-in set.
  ignore: {
    entries: [
      { type: "folder", pattern: "coverage" },
    ],

    // Opt into reusing root .gitignore entries.
    use_gitignore: true,
  },

  rules: {
    maxFunctionLines: {
      max: 80,
    },
  },
});
```

### Presets

#### `nodeProcessBoundary`

`nodeProcessBoundary` is opt-in. It expands into ordinary `bannedPatterns` entries so projects can keep direct Node `process` access inside explicit boundary files.

```ts
presets: {
  nodeProcessBoundary: {
    envBoundaryFiles: ["src/backend/core/env.ts"],
    processBoundaryFiles: [
      "src/backend/shared/process/index.ts",
      "src/backend/shared/process/cjs.cjs",
    ],
  },
}
```

`envBoundaryFiles` allows `process.env`. `processBoundaryFiles` allows the other runtime process APIs covered by the preset, including `process.argv`, `process.cwd(`, `process.exit(`, `process.pid`, `process.platform`, `process.arch`, `process.memoryUsage(`, and standard stream access.

Manual `rules.bannedPatterns` entries still work normally. If both are configured, the preset patterns are appended to the manual list and share the same `bannedPatterns` severity and exclusions.

### Selectors

`check` and `fix` both accept positional selectors:

```sh
code-discipline check max-file-lines max-function-lines
code-discipline fix banned-files min-file-lines max-characters-per-line imports remove-comments structural-blank-lines
code-discipline check prettier
code-discipline fix prettier
```

Rules use kebab-case public slugs:

- `banned-patterns`
- `banned-files`
- `min-file-lines`
- `min-declaration-name`
- `max-file-lines`
- `max-characters-per-line`
- `max-function-lines`
- `folderize-compound-files`
- `imports`
- `remove-comments`
- `structural-blank-lines`
- `dry`

`fix` only accepts fixable rules. Trying to run `code-discipline fix max-function-lines` or `code-discipline fix dry` fails clearly.

Formatter selectors such as `prettier` are enabled by top-level `formatters` config, not by `rules`.

### Formatters

Formatters are configured at top level under `formatters`, not under `rules`. Presence enables a formatter; there is no `enabled: true` key.

`formatters.prettier` uses Prettier as the formatting engine and keeps `.trebired/code-discipline/config.ts` as the formatting policy source. `check prettier` validates formatting without modifying files, while `fix prettier` writes formatted files. Running `code-discipline fix` with no selectors runs configured Prettier formatting last after structural, import, comment, and blank-line fixes. Set `formatters.prettier.ignore: true` to reuse the shared top-level `ignore`.

Example:

```ts
formatters: {
  prettier: {
    ignore: true,
    options: {
      printWidth: 100,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: true,
      trailingComma: "all",
      endOfLine: "lf",
    },
  },
},
```

## Runtime

### Native Backend

`@trebired/code-discipline` can use a Rust native backend when a matching binary is available, with the TypeScript implementation as the fallback. This follows the same native-fast-path shape as `@trebired/logger`: package users keep the same CLI/API, while hot scanning and rewrite paths can move into Rust.

The current native backend accelerates source scanning, `max-file-lines`, common `max-function-lines` paths, `folderize-compound-files` checks, and `remove-comments`. Its comment scanner understands JavaScript, TypeScript, Go, Rust, Python, shell, SCSS, and CSS. If no binary is present, the package automatically uses the TypeScript fallback.

Useful native controls:

- `bun run build:native` builds the host native addon into `native/<platform>.node`
- `bun run build:native:matrix` builds the release target matrix
- `TB_CODE_DISCIPLINE_DISABLE_NATIVE=1` forces the TypeScript fallback
- `TB_CODE_DISCIPLINE_NATIVE_BINARY=/path/to/addon.node` loads a specific native addon

Top-level `sync` is gone.

`imports` is now just another fixable rule, so targeted sync work is done through:

```sh
code-discipline fix imports
```

If you want the terminal output written to a package-managed report file too, add `save`:

```sh
code-discipline check save
```

This writes a plain-text report to a timestamped file such as `.trebired/code-discipline/generated/reports/cd-report-2026-05-26-19-00-00.txt`.

Typical `package.json` scripts can stay simple:

```json
{
  "scripts": {
    "discipline:check": "code-discipline check",
    "discipline:fix": "code-discipline fix",
    "start:app": "bun dist/server.js",
    "start": "code-discipline gate -- bun run start:app"
  }
}
```

`gate` runs the same repo config discovery as `check`. If violations are found, it exits non-zero and does not launch the child command. If the repo is clean, it starts the child command and forwards its exit status.

Long check and fix runs emit chunked rule progress in the CLI, including current violation counts and fix mutation counts where applicable.

### Logging

Code Discipline uses logger levels directly: passing summaries use `success`, blocking findings use `fail`, and warning findings use `warn`.

```ts
logging: {
  warnings: false,
}
```

Set `logging.warnings: false` to hide warning-level CLI output and warning-only report rows. The default is `true`.

## Public API

### Runtime API

The package-owned runtime dispatcher now has two modes only:

- `check`
- `fix`

```ts
import { codeDiscipline } from "@trebired/code-discipline";

const result = await codeDiscipline({
  mode: "fix",
  projectRoot: process.cwd(),
  onlyRules: ["imports"],
  rules: {
    imports: {
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
    bannedFiles: {
      patterns: ["**/*.spec.ts"],
    },
    maxFunctionLines: {
      max: 80,
    },
    imports: {
      alias: {
        strategy: "relative-path-slug",
      },
    },
  },
});

await discipline.fix({
  projectRoot: process.cwd(),
  onlyRules: ["imports"],
});
```

Every violation is treated uniformly now. Results expose `ok`, `violationCount`, and `violations`, and the CLI prints concise rule/file/message lines instead of large JSON-style payloads.

### Advanced Helpers

Low-level helpers are still exported for advanced tooling:

- `checkCodeDiscipline()`
- `fixCodeDiscipline()`
- `imports()`
- `defineCodeDisciplineConfig()`
- `findCodeDisciplineConfigModule()`
- `loadResolvedCodeDisciplineConfig()`
- `prepareTsconfigPaths()`
- `restoreTsconfigPaths()`
- `syncPackageJsonImportsFromTsconfigPaths()`

`imports()` remains available as a lower-level helper, but the package CLI no longer exposes a separate `sync` command.

## CLI

### Command Reference

- `code-discipline` runs the package CLI.

The CLI exits with status 1 when it reports a failing violation or runtime error.

## What It Does Not Do

This package does not:

- replace a formatter, linter, compiler, or build system
- own application architecture or product naming policy
- require generated output to be committed
