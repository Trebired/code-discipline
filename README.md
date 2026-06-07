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
- functions growing too large
- compound filenames that want to become folders
- alias drift between `tsconfig.json` and source imports
- returning structured policy results that a caller can interpret

That is the lane of this package.

## Commands

```sh
code-discipline check
code-discipline sync
code-discipline fix
```

The CLI auto-discovers a config module in the current project root. Supported default names:

- `discipline.config.mjs`
- `discipline.config.js`
- `discipline.config.cjs`
- `code-discipline.config.mjs`
- `code-discipline.config.js`
- `code-discipline.config.cjs`

You can still override discovery explicitly:

```sh
code-discipline check --config ./discipline.config.mjs
```

Typical `package.json` scripts can now stay direct and generic:

```json
{
  "scripts": {
    "discipline:check": "code-discipline check",
    "discipline:fix": "code-discipline fix",
    "discipline:sync": "code-discipline sync"
  }
}
```

Command responsibilities stay clean:

- `check`: read-only validation and logging
- `sync`: package-owned synchronization work from config
- `fix`: configured structural fixes only

Mutations stay opt-in:

- `syncImports` rewrites imports and `tsconfig.json` only when `syncImports.fix` is `true`
- `runtimeImportsSync` updates `package.json#imports` only when that feature is enabled
- `fix` applies folderization moves only when `folderizeCompoundFiles.fix` is `true`

## Simple Runtime API

For app startup or scripts, you can now use one package-owned entrypoint instead of hand-rolling mode dispatch in app code.

```ts
import { codeDiscipline } from "@trebired/code-discipline";

const result = await codeDiscipline({
  mode: "check",
  projectRoot: process.cwd(),
  rules: {
    maxFileLines: {
      severity: "warning",
      max: 500,
    },
    maxFunctionLines: {
      severity: "warning",
      max: 80,
    },
  },
});
```

`mode: "startup"` is a convenience alias for sync-oriented startup flows:

```ts
import { codeDiscipline } from "@trebired/code-discipline";

await codeDiscipline({
  mode: "startup",
  projectRoot: PROJECT_ROOT,
  logger,
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
```

If you want to define repo rules once and reuse them, create a bound helper:

```ts
import { createCodeDiscipline } from "@trebired/code-discipline";

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

await discipline.startup({ projectRoot: PROJECT_ROOT, logger });
process.exitCode = (await discipline.check({ projectRoot: process.cwd() })).ok ? 0 : 1;
```

## Config

Rules are enabled by presence. If a rule object exists under `rules`, it runs. If the rule is omitted, it is disabled.

`severity` is discipline metadata, not a logger level and not process control. The library never calls `process.exit()` from core APIs. Callers decide what to do with `ok`, `errors`, and `warnings`.

Example config module:

```js
export default {
  sourceRoot: "src",
  sourceExtensions: [".ts", ".tsx", ".js", ".jsx"],
  excludeDirs: ["node_modules", "dist", ".vite"],
  logging: {
    enabled: true,
    quiet: false,
  },
  tsconfigPaths: {
    normalize: "relative-dot-prefix",
    restoreAfterRun: true,
  },
  runtimeImportsSync: {
    enabled: true,
    source: "tsconfig.paths",
    target: "package.json.imports",
    aliasPrefix: "#",
  },
  lifecycle: {
    async beforeRun(context) {
      context.state.started = true;
    },
    async afterRun(context, result) {
      context.state.finished = result.ok;
    },
  },
  rules: {
    maxFileLines: {
      severity: "warning",
      max: 500,
    },
    maxFunctionLines: {
      severity: "warning",
      max: 80,
    },
    folderizeCompoundFiles: {
      severity: "error",
      fix: true,
      separators: ["_", "-"],
    },
    syncImports: {
      severity: "error",
      fix: true,
      alias: {
        strategy: "relative-path-slug",
      },
      allowRelative: ["./"],
    },
  },
};
```

## Generic Lifecycle Hooks

If a project needs package-owned preprocessing or postprocessing around discipline commands, use config hooks instead of wrapper scripts.

Available hooks:

- `lifecycle.beforeRun(context)`
- `lifecycle.afterRun(context, result)`
- `lifecycle.beforeMode(context)`
- `lifecycle.afterMode(context, result)`

The hook context includes:

- `mode`
- `projectRoot`
- `configPath`
- `config`
- mutable `state`

## Optional Tsconfig Path Normalization

Use `tsconfigPaths` when a project needs temporary normalization of `compilerOptions.paths` before discipline runs.

```js
export default {
  tsconfigPaths: {
    normalize: "relative-dot-prefix",
    restoreAfterRun: true,
  },
};
```

Supported normalization modes:

- `"relative-dot-prefix"`: turns `src/x.ts` into `./src/x.ts`
- `"strip-dot-prefix"`: turns `./src/x.ts` into `src/x.ts`
- `"none"`: disables the helper

`restoreAfterRun: true` restores the original `tsconfig.json` after read-oriented runs so the normalization can stay package-owned instead of living in shell wrappers.

## Optional Package Imports Sync

Use `runtimeImportsSync` when a project wants `package.json#imports` mirrored from `tsconfig.compilerOptions.paths`.

```js
export default {
  runtimeImportsSync: {
    enabled: true,
    source: "tsconfig.paths",
    target: "package.json.imports",
    aliasPrefix: "#",
  },
};
```

Behavior:

- only aliases matching the configured prefix or prefixes are managed
- unrelated existing `package.json#imports` entries are preserved
- the feature runs through `code-discipline sync` and `mode: "sync"` / `mode: "startup"`

## Checks

`checkCodeDiscipline()` is read-only. It never moves files, rewrites imports, or updates `tsconfig.json`.

```ts
import { checkCodeDiscipline } from "@trebired/code-discipline";

const result = await checkCodeDiscipline({
  projectRoot: "/repo",
  rules: {
    maxFileLines: {
      severity: "warning",
      max: 500,
    },
    maxFunctionLines: {
      severity: "warning",
      max: 80,
    },
    folderizeCompoundFiles: {
      severity: "error",
      separators: ["_", "-"],
    },
    syncImports: {
      severity: "error",
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
type CodeDisciplineSeverity = "error" | "warning";

type CodeDisciplineViolation = {
  rule: "max-file-lines" | "max-function-lines" | "folderize-compound-files" | "sync-imports";
  severity: CodeDisciplineSeverity;
  fix: boolean;
  filePath: string;
  message: string;
  details: Record<string, unknown>;
  suggestedPath?: string;
};

type CodeDisciplineResult = {
  ok: boolean;
  errors: number;
  warnings: number;
  violations: CodeDisciplineViolation[];
};
```

`ok` becomes `false` only when at least one returned violation has `severity: "error"`.

## Function Length

`maxFunctionLines` reports function-like declarations whose total span exceeds a configured limit.

- function declarations
- function expressions
- arrow functions
- class methods
- constructors
- getters and setters

Violations include the function name when available, plus `startLine` and `endLine` details.

## Folderization

`folderizeCompoundFiles` is structural. It does not depend on configured suffix lists.

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

`syncImports()` and `code-discipline sync` use the same severity-aware config shape.

```ts
import { syncImports } from "@trebired/code-discipline";

const result = await syncImports({
  projectRoot: "/repo",
  severity: "error",
  fix: true,
  alias: {
    strategy: "relative-path-slug",
  },
  allowRelative: ["./"],
});
```

Behavior:

- `fix: false` reports alias/import drift as violations
- `fix: true` rewrites imports and updates `tsconfig.json`
- `allowRelative: ["./"]` keeps same-folder relative imports
- upward relative imports can be reported or rewritten through the configured alias policy

`syncImports()` keeps its operational result fields and also returns `errors`, `warnings`, and `violations`.

## Logging

When you provide a logger, discipline results are emitted through it. Trebired-style loggers are supported directly, and the package falls back safely when no logger is provided.

The default/common logger adaptation path is powered by `@trebired/logger-adapter`, while `logging.adapter(event)` remains available when you want exact control over the emitted event shape.

## Public API

- `codeDiscipline()`
- `createCodeDiscipline()`
- `checkCodeDiscipline()`
- `fixCodeDiscipline()`
- `syncImports()`
- `defineCodeDisciplineConfig()`
- `findCodeDisciplineConfigModule()`
- `loadResolvedCodeDisciplineConfig()`
- `prepareTsconfigPaths()`
- `restoreTsconfigPaths()`
- `syncPackageJsonImportsFromTsconfigPaths()`

The package also exports the public TypeScript types for severity, rule config, results, violations, alias strategies, logging adapters, and source scan rows.
