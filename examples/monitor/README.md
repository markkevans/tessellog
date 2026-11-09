# monitor

Watches a log. It trusts a new checkpoint only after two checks:
- the checkpoint is consistent with the last one it trusted;
- every new entry is proved against it.

It prints `index<TAB>sha256(entry)` for each new entry. It exits with status 1 if the log forks, shrinks, or serves anything it cannot verify.

```sh
pnpm --filter @tessellog/example-monitor start \
  --url https://log.example.com/ --verifier-key "$(cat my-log.pub)" \
  --state ./monitor.state [--interval-ms 5000] [--once]
```

- [`src/monitor.ts`](./src/monitor.ts): `createMonitor`, about seventy lines on top of `@tessellog/client`.
- [`test/monitor.test.ts`](./test/monitor.test.ts) covers forks, rollbacks, tampered bundles and resuming from saved state.

More: [verifying and monitoring logs](../../docs/guides/verifying.md).
