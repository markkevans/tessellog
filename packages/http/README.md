# @tessellog/http

A fetch-style HTTP handler for a tessellog log. `POST /add` adds an entry. `GET` serves the checkpoint, tiles and entry bundles, each with suitable cache headers. It runs anywhere the Fetch API does. `@tessellog/http/node` serves it with `node:http`.

```sh
npm install @tessellog/http @tessellog/appender
```

<!-- snippet: personality/http-handler.ts -->
```ts
import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { createLogHandler } from "@tessellog/http";
import { serveNode } from "@tessellog/http/node";

export const serveLog = async (signer: NoteSigner) => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const appender = createAppender({ driver, signer, checkpointInterval: 1_000 });
  const server = await serveNode({
    handler: createLogHandler({ appender }),
    port: 2024,
    host: "0.0.0.0",
    onError: console.error,
  });
  console.log(`POST entries to ${server.url}add`);

  process.once("SIGTERM", async () => {
    await server.close();
    await appender.shutdown();
    await driver.close();
  });
};
```

## Behaviour

| Request | Response |
|---|---|
| `POST /add` | `200` with the index, once a published checkpoint covers it. `413` over `maxEntryBytes` (the body is not read in full). `503` with `Retry-After` on pushback. |
| `GET /checkpoint` | `Cache-Control: no-cache` |
| full tiles and bundles | `Cache-Control: public, max-age=31536000, immutable` |
| partial tiles and bundles | `Cache-Control: public, max-age=3600` |
| anything else | `404`, including non-canonical tile paths, or `405` |

## API

- `createLogHandler({ appender, maxEntryBytes?, onError? })` returns a `(request: Request) => Promise<Response>` handler.
- `serveNode({ handler, port, host, onError })` from `@tessellog/http/node` resolves with `{ url, close }`. It accepts any fetch-style handler, including a witness's.

Guide: [writing a personality](https://github.com/markkevans/tessellog/blob/main/docs/guides/personalities.md).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
