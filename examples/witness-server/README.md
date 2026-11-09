# witness-server

A standalone [tlog-witness](https://c2sp.org/tlog-witness). It cosigns checkpoints for the logs it is configured with, and only when each new checkpoint is consistent with the last. Its state is kept on disk, so a restart can never be used to make it cosign a rollback.

```sh
pnpm --filter @tessellog/example-keygen keygen --name example.com/witness --out ./witness
pnpm --filter @tessellog/example-witness-server start \
  --storage-dir ./witness-state --cosigner-key ./witness.key \
  --log "$(cat my-log.pub)" --port 2025
```

Logs then list it in their policy, using the cosignature key that `keygen` printed:

```
witness W1 example.com/witness+…+B… http://127.0.0.1:2025/
quorum W1
```

- [`src/witness-server.ts`](./src/witness-server.ts): `createWitness` with `openPosixWitnessStore`, served by `serveNode`.
- [`test/witness-server.test.ts`](./test/witness-server.test.ts) witnesses a log, checks the quorum with a client, and restarts the witness.

More: [witnessing](../../docs/guides/witnessing.md).
