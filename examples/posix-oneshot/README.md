# posix-oneshot

Adds files to a log stored in a directory, then exits. It is the TypeScript counterpart of Tessera's `posix-oneshot`, and the two can take turns on the same log.

```sh
pnpm --filter @tessellog/example-posix-oneshot oneshot \
  --storage-dir ./my-log --private-key ./my-log.key [--witness-policy ./policy] entries/*
```

- [`src/index.ts`](./src/index.ts): `oneshot` opens the POSIX driver, adds every file, and shuts down cleanly.
- With `--witness-policy`, it publishes only checkpoints the policy's witnesses cosigned.

More: [getting started](../../docs/guides/getting-started.md).
