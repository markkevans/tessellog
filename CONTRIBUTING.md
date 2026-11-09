# Contributing to tessellog

Thanks for helping. tessellog aims to be a faithful, well-tested TypeScript port of Tessera, so changes are held to a few firm rules.

## Setting up

```sh
pnpm install
docker compose up -d     # Floci, which emulates S3 and DynamoDB for the AWS tests
pnpm test:coverage       # must stay at 100% on every metric
pnpm typecheck           # the workspace, plus browser-safety for the portable packages
```

The interop suite (`bash interop/run.sh`) needs Go. It checks logs, witnessing, migration and static CT against Tessera in both directions. CI runs it on every push.

## How changes are made

- **Test first.** Every change starts with a failing test that describes the behaviour. Commits follow suit: `test:` (red), then `feat:` or `fix:` (green), then `refactor:` when it adds value.
- **Test behaviour, not implementation.** Test through each package's public API, building test data with factories rather than shared mutable setup.
- **100% coverage** of `packages/*/src` and `examples/*/src`. An uncovered `??` fallback is usually a real bug: treating missing storage as empty has hidden data loss more than once.
- **Strict TypeScript.** No `any`, and no type assertions. Use `Result<T>` for untrusted input, `RangeError` for invalid arguments from our own code, and Zod at trust boundaries such as database rows and options.
- **Expected values come from somewhere independent:** upstream Go vectors, RFC 6962, or an oracle like `node:crypto`. Never from the code under test.
- **Drivers and stores** must pass the suites in `@tessellog/driver-conformance`. A new rule for one driver usually belongs in the shared suite.

[CLAUDE.md](./CLAUDE.md) records the project's gotchas and patterns. Read it before a large change.

## Documentation

Code in the guides and package READMEs lives in [`docs/snippets`](./docs/snippets):
1. Edit the snippet file.
2. Run `pnpm --filter @tessellog/docs sync` to update the markdown.

A test fails if they drift, or if a TypeScript block isn't a snippet. Write new guides in plain, direct English, and add self-contained snippets to the list the docs test runs.

## Releasing

Each user-visible change adds a changeset (`pnpm changeset`). All packages are released together at the same version. A maintainer publishes by running the **Release** workflow by hand. It runs every gate, applies the changesets, smoke-tests the tarballs, publishes to npm through trusted publishing (no npm token; provenance is automatic), and pushes the release commit and tags.

## Licence

By contributing you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE), the same as the rest of the project and as Tessera.
