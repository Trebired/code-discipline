# Contributing

Thanks for helping improve `@trebired/code-discipline`.

## Development Setup

```sh
bun install
```

The package is authored in TypeScript and published from `dist`.

## Common Commands

```sh
bun run typecheck
bun test
bun run build
```

## Pull Request Checklist

- Keep public API changes intentional and documented in `README.md`.
- Add or update tests for behavior changes.
- Run typecheck, tests, and build before opening a PR.
- Update `CHANGELOG.md` under `Unreleased`.
- Do not commit `dist` or generated package tarballs.

## Design Principles

- Keep source scanning deterministic and easy to inspect.
- Preserve valid alias ids instead of churning paths without need.
- Keep discipline checks actionable and easy to wire into dev or CI.
- Rewrite imports explicitly and predictably, never by framework convention.
- Keep the package runtime-agnostic across Bun and Node.js projects.
- Avoid external runtime dependencies unless they remove real complexity.

## Release Process

1. Move `CHANGELOG.md` entries from `Unreleased` into a versioned section.
2. Update the package version:

   ```sh
   npm version patch
   ```

   Use `minor` or `major` instead of `patch` when appropriate.

3. Verify the package:

   ```sh
   bun run typecheck
   bun test
   bun run build
   npm pack --dry-run
   ```

4. Publish with:

   ```sh
   npm publish
   ```

`npm publish` runs `prepublishOnly`, which typechecks, tests, and builds before publishing.
