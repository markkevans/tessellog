# cloudflare-worker

A log on Cloudflare. A Worker routes every request to one **Durable Object**, the log's single writer. The Durable Object serves the log through `@tessellog/http`, with tiles in R2 and sequencing in D1.

```sh
wrangler r2 bucket create tessellog-log
wrangler d1 create tessellog-log          # put the id in wrangler.toml
wrangler secret put LOG_PRIVATE_KEY       # paste the contents of my-log.key
wrangler deploy
```

- [`src/worker.ts`](./src/worker.ts): the Worker and the `LogDurableObject`. The object reopens the log after a failure, for example while a previous instance's lease runs out.
- [`wrangler.toml`](./wrangler.toml): the bindings.
- [`test/worker.test.ts`](./test/worker.test.ts) runs the Worker in Node against Miniflare's R2 and D1.
- [`test/workerd.test.ts`](./test/workerd.test.ts) bundles it with esbuild and runs it on **workerd**. That proves the bundle needs no Node built-ins.

More: [choosing a storage driver](../../docs/guides/drivers.md#cloudflare-r2-and-d1).
