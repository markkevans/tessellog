# http-log

A complete log service on one machine. It runs the POSIX driver behind `@tessellog/http`: `POST /add` answers with the index once a checkpoint covers it, and `GET` serves the checkpoint and tiles.

```sh
pnpm --filter @tessellog/example-http-log start \
  --storage-dir ./my-log --private-key ./my-log.key --port 2024 --checkpoint-interval-ms 1000

curl -X POST --data-binary 'hello' http://127.0.0.1:2024/add
curl http://127.0.0.1:2024/checkpoint
```

- [`src/http-log.ts`](./src/http-log.ts): `startHttpLog` wires the driver, the appender, the handler and `serveNode` together, in about forty lines.
- [`test/http-log.test.ts`](./test/http-log.test.ts) adds entries over HTTP and proves them with `@tessellog/client`, including across a restart.

More: [writing a personality](../../docs/guides/personalities.md).
