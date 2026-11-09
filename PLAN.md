# Plan: Close the gaps, then document tessellog with runnable examples

## Goal

Someone new can install tessellog, generate keys, run a log on POSIX, AWS or Cloudflare, verify it, and witness it, by following the docs and copying a tested example.

## Acceptance criteria

- [ ] The README promises nothing the code doesn't do (today it claims a quiescent lifecycle that doesn't exist).
- [ ] A user never needs Go: keys can be generated in TypeScript.
- [ ] Packages can be built and installed from a tarball, and CI checks that.
- [ ] Every package has a README with install, a minimal example and its API surface.
- [ ] `docs/` has guides for concepts, getting started, drivers, keys, witnessing, antispam, operations and static CT.
- [ ] Every example is runnable and covered by tests, so the docs can't rot.
- [ ] 100% coverage, typecheck and interop stay green after every step.

## Part A: gaps (TDD, test → feat → refactor commits)

1. **Key generation.** `generateNoteKey({ name })` returns `{ signerKey, verifierKey }` in Go's `note.GenerateKey` format. Round-trip it through `parseSignerKey` and `signNote`, and check it against Go `note` in interop.
2. **Waiting for publication.** `appender.awaitPublication(index)` resolves with the first published checkpoint that covers the index, like Tessera's `PublicationAwaiter`. It rejects on shutdown.
3. **Quiescent lifecycle.** `openQuiescent({ driver })` serves reads and the last checkpoint and never writes, like Tessera's `NewLogReader`/quiescent mode.
4. **Persistent witness store.** A POSIX `WitnessStore` with atomic compare-and-swap that survives restarts. Add a `describeWitnessStore` conformance suite that the memory store also passes.
5. **D1 beyond 2^53.** Store indices as fixed-width TEXT in D1, so Cloudflare indices are exact across the full uint64 range. Test at 2^53 + 1.
6. **Publishable packages.** A `tsc` build to `dist/` with `.d.ts`, `exports`/`files`/`types`, and a CI "pack smoke test". It packs every package, installs the tarballs into a scratch project, and imports each entry point under plain Node.

**Still deferred, recorded in ADRs:**
- ML-DSA-44 cosignatures (no Go reference vectors yet).
- Mirroring (Tessera's is still in progress).
- GCP and MySQL drivers.
- RSA RFC 6962 keys.

## Part B: examples (each a workspace package with tests)

7. **`examples/http-log`:** a Node `node:http` personality. `POST /add` returns the index after `awaitPublication`, the server serves tiles, bundles and the checkpoint, and it uses the POSIX driver. The test starts it, adds entries and verifies them with `@tessellog/client`.
8. **`examples/cloudflare-worker`:** a Worker personality on R2 and D1 with `wrangler.toml`. Tested with Miniflare, with add followed by client verification.
9. **`examples/aws-log`:** an S3 and DynamoDB log, with table creation, adds and verification. Tested against Floci.
10. **`examples/monitor`:** a CLI that polls a log, checks consistency between checkpoints and streams new entries. Tested against the http-log example.
11. **`examples/witness-server`:** a standalone witness using the POSIX witness store, with the http-log witnessed through a policy file. Tested end to end.
12. **`examples/keygen`:** a CLI that wraps `generateNoteKey`. Its output feeds posix-oneshot in the test.

## Part C: documentation

13. **Package READMEs** for all 9 published packages.
14. **Guides in `docs/guides/`:**
    - concepts (the entry lifecycle, tiles, checkpoints, how tessellog maps to Tessera);
    - getting started (10 minutes, POSIX);
    - keys and signing;
    - choosing and configuring a driver (POSIX, AWS, Cloudflare, writing your own with the conformance suite);
    - personalities and HTTP serving;
    - verifying and monitoring logs (client);
    - witnessing;
    - antispam and deduplication;
    - operations (GC, shutdown, migration from Tessera, quiescence);
    - static CT.
15. **Snippet checks.** Code blocks in the guides are type-checked. Snippets live in `docs/snippets/*.ts`, are included by the docs and are run by `pnpm typecheck`.
16. **Release tooling.** Changesets, package metadata (`repository`, `homepage`, `keywords`, `publishConfig.access`), and a manual-dispatch GitHub workflow that builds, tests and runs `changeset publish` with an `NPM_TOKEN` secret. Mark triggers the publish; nothing is published by this plan.
17. **README rewrite.** A 30-second pitch, a quickstart, links into the guides and examples, and a capability matrix against Tessera. Then update CLAUDE.md, remove PLAN.md, and add ADR 11 for the new lifecycles and packaging.

Each step is one commit set (test, feat, refactor), gated on `pnpm test:coverage >/dev/null && pnpm typecheck >/dev/null`, then pushed.
