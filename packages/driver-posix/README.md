# @tessellog/driver-posix

Stores a tessellog log in a directory, at its tlog-tiles paths:
- Writes are atomic: write, `fsync`, then rename.
- It is restart-safe.
- A lock file enforces a single writer.

It also provides persistent antispam and witness stores.

```sh
npm install @tessellog/driver-posix @tessellog/appender
```

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

## API

- `openPosixDriver({ root, entriesPath? })` returns a `LogDriver` with `close()`, which releases `.state/lock`.
- `openPosixAntispamStore({ root })` returns a persistent `AntispamStore`.
- `openPosixWitnessStore({ root })` returns a persistent `WitnessStore` with compare-and-swap, plus `close()`.

Serve the directory with any web server, but **not** its `.state/` directory.

Guide: [choosing a storage driver](https://github.com/markkevans/tessellog/blob/main/docs/guides/drivers.md).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
