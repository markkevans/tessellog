# Getting started

This guide takes you from nothing to a running log that you add entries to over HTTP and verify independently. You need Node.js 22 or later.

## Install

```sh
npm install @tessellog/core @tessellog/appender @tessellog/client @tessellog/driver-posix @tessellog/http
```

The packages are ES modules with TypeScript types included. Steps 1 and 3 need nothing more than these packages.

Steps 2, 4 and 5 use the ready-made command-line tools in the repository's [examples](../../examples). To run them, clone the repository and install its dependencies:

```sh
git clone https://github.com/markkevans/tessellog.git
cd tessellog
pnpm install
```

## 1. A log in memory

The quickest way to see the whole cycle is in memory. This program does four things:
- It generates a key and starts an appender.
- It adds an entry and waits until a signed checkpoint covers it.
- It reads the checkpoint back with a client.
- The client proves the entry is included.

<!-- snippet: quickstart/memory-log.ts -->
```ts
import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { createLogClient } from "@tessellog/client";
import { generateNoteKey, parseSignerKey, parseVerifierKey } from "@tessellog/core";

const keys = generateNoteKey({ name: "example.com/my-log" });
if (!keys.ok) throw new Error(keys.error);
const signer = parseSignerKey(keys.value.signerKey);
const verifier = parseVerifierKey(keys.value.verifierKey);
if (!signer.ok || !verifier.ok) throw new Error("generated keys did not parse");

const appender = createAppender({
  driver: createMemoryDriver(),
  signer: signer.value,
  checkpointInterval: 100,
});

const entry = new TextEncoder().encode("hello, transparency");
const { index } = await appender.add(entry);
await appender.awaitPublication(index);

const client = createLogClient({
  fetcher: appender.reader,
  origin: "example.com/my-log",
  logVerifier: verifier.value,
});
const latest = await client.latestCheckpoint();
if (!latest.ok) throw new Error(latest.error);
const proved = await client.proveInclusion({ entry, index, checkpoint: latest.value.checkpoint });
console.log(proved.ok ? `entry ${index} is in the log` : proved.error);

await appender.shutdown();
```

The appender's `reader` has exactly the methods a client needs to fetch from, so a client can verify a log in the same process. Real clients fetch over HTTP, as in step 4.

## 2. Keys

A log signs its checkpoints with an Ed25519 [signed-note](https://c2sp.org/signed-note) key. The key's name is the log's **origin**, the first line of every checkpoint. By convention the origin is a URL-like name you control, such as `example.com/my-log`.

```sh
cd examples/keygen
pnpm keygen --name example.com/my-log --out ../../my-log
```

This writes `my-log.key`, the private key, with mode `0600`. Keep it secret. It also writes `my-log.pub`, the verifier key you give to anyone who checks the log. Go's `note.GenerateKey` produces the same format, so Tessera accepts these keys. More in [Keys and signing](./keys-and-signing.md).

## 3. A log on disk

The POSIX driver stores the log in a directory, in exactly the layout clients fetch. It is safe across restarts, and it refuses to open a directory another writer holds.

<!-- snippet: quickstart/posix-log.ts -->
```ts
import { readFile } from "node:fs/promises";
import { createAppender } from "@tessellog/appender";
import { parseSignerKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

const signer = parseSignerKey((await readFile("log.key", "utf8")).trim());
if (!signer.ok) throw new Error(signer.error);

const driver = await openPosixDriver({ root: "./my-log" });
const appender = createAppender({ driver, signer: signer.value });

const added = await Promise.all(
  ["first", "second", "third"].map((text) => appender.add(new TextEncoder().encode(text))),
);
console.log(added.map(({ index }) => index));

await appender.shutdown();
await driver.close();
```

`shutdown()` sequences anything still batched, integrates it and publishes a final checkpoint. Always await it before exiting.

## 4. Serve it over HTTP

The [`http-log`](../../examples/http-log) example wraps the POSIX driver in `@tessellog/http`:

```sh
cd examples/http-log
pnpm start --storage-dir ../../my-log-data --private-key ../../my-log.key --port 2024
```

```sh
curl -X POST --data-binary 'my first entry' http://127.0.0.1:2024/add   # → 0, once published
curl http://127.0.0.1:2024/checkpoint
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:2024/tile/0/000.p/1
```

`POST /add` answers with the entry's index once a published checkpoint covers it. Everything else is a plain GET of the tlog-tiles files, sent with suitable `Cache-Control` headers.

## 5. Verify it independently

Anyone with the verifier key can now check the log. The [`monitor`](../../examples/monitor) example checks that each new checkpoint is consistent with the last one it trusted, and proves every new entry:

```sh
cd examples/monitor
pnpm start --url http://127.0.0.1:2024/ --verifier-key "$(cat ../../my-log.pub)" --state ./my-log.state
```

Add more entries and watch the monitor print them. Each one is proved against a signed checkpoint before it is shown. If the log ever rewrites history, the monitor exits with an alarm.

## Next steps

- Put the log in the cloud: [Choosing a storage driver](./drivers.md).
- Build your own API: [Writing a personality](./personalities.md).
- Have independent witnesses cosign your checkpoints: [Witnessing](./witnessing.md).
- Learn how to run a log in production: [Operating a log](./operations.md).
