# Writing a personality

A **personality** is your application around the log. It decides what an entry is, who may add one, and how clients talk to it. tessellog takes care of everything below that.

## The ready-made HTTP API

`@tessellog/http` provides a fetch-style handler, `(request: Request) => Promise<Response>`, that works anywhere the Fetch API does: Node, Deno, Bun, Cloudflare Workers and service workers. `@tessellog/http/node` serves it with `node:http`:

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

| Request | Response |
|---|---|
| `POST /add` with the entry as the body | `200` with the index as text, once a published checkpoint covers it |
| | `413` if the body exceeds the layout's limit (65,535 bytes, or `maxEntryBytes`). The body is not read in full. |
| | `503` with `Retry-After: 1` when the log pushes back |
| `GET /checkpoint` | the signed checkpoint, with `Cache-Control: no-cache` |
| `GET /tile/<L>/<N>` and `GET /tile/entries/<N>` | full tiles and bundles, with `Cache-Control: public, max-age=31536000, immutable` |
| `GET /tile/<L>/<N>.p/<W>` and `GET /tile/entries/<N>.p/<W>` | partial tiles and bundles, with `Cache-Control: public, max-age=3600` |
| anything else | `404` (non-canonical tile paths too) or `405` |

Unexpected failures become `500 internal error`, and the error goes to `onError` rather than to the client.

## Your own API

Most personalities validate entries and choose their own responses. Call the appender directly:

<!-- snippet: personality/custom-route.ts -->
```ts
import { EntryTooLargeError, PushbackError, type Appender } from "@tessellog/appender";

export const addRelease = async (appender: Appender, manifest: unknown): Promise<Response> => {
  if (typeof manifest !== "object" || manifest === null || !("artifact" in manifest)) {
    return new Response("a release manifest needs an artifact\n", { status: 400 });
  }
  try {
    const { index, isDup } = await appender.add(new TextEncoder().encode(JSON.stringify(manifest)));
    const checkpoint = await appender.awaitPublication(index);
    return Response.json({ index: index.toString(), isDup, checkpoint: new TextDecoder().decode(checkpoint) });
  } catch (error) {
    if (error instanceof PushbackError) {
      return new Response("busy, retry shortly\n", { status: 503, headers: { "retry-after": "1" } });
    }
    if (error instanceof EntryTooLargeError) {
      return new Response(`${error.message}\n`, { status: 413 });
    }
    throw error;
  }
};
```

Things to decide:
- **What exactly is logged.** Log a canonical encoding (the exact bytes you want people to verify), not a structure whose serialisation might change.
- **Whether to wait for publication.** `add` resolves when the index is durable, in milliseconds. `awaitPublication` waits for the next checkpoint, up to `checkpointInterval`. Wait when the caller needs a proof straight away, and return just the index when it doesn't.
- **Pushback.** Once `pushback.maxOutstanding` entries (4,096 by default) have been accepted but not yet integrated, `add` throws `PushbackError`. With a persistent antispam store, `PushbackAntispamError` (a subclass) means the deduplication index has fallen more than `antispam.pushbackThreshold` entries (2,048) behind the tree. Both mean "slow down": answer 503 rather than retrying in a loop.
- **Errors.** `EntryTooLargeError` is thrown for entries over the layout's limit. A layout's own validation (static CT, for example) throws a plain `Error` with the reason.

## Serving reads at scale

Reads are static files, so the writer need not serve them at all:
- **POSIX:** serve the directory, except `.state/`, from nginx or a CDN.
- **AWS:** make `checkpoint` and `tile/` readable from the bucket or CloudFront, as the [`aws-log`](../../examples/aws-log) example does.
- **Cloudflare:** put a custom domain on the R2 bucket for public reads.

Use the cache lifetimes in the table above. Never cache `checkpoint` for long, or clients will see a stale log.

## Examples

- [`http-log`](../../examples/http-log): the handler above on the POSIX driver, with a CLI.
- [`aws-log`](../../examples/aws-log): the handler on S3 and DynamoDB. Clients read from S3.
- [`cloudflare-worker`](../../examples/cloudflare-worker): a Worker and Durable Object over R2 and D1.
