---
layout: home

hero:
  name: tessellog
  text: Transparency logs in TypeScript
  tagline: Tamper-evident, append-only logs that anyone can verify from static files. A port of Tessera, and interoperable with it.
  actions:
    - theme: brand
      text: Get started
      link: /guides/getting-started
    - theme: alt
      text: Concepts
      link: /guides/concepts
    - theme: alt
      text: GitHub
      link: https://github.com/markkevans/tessellog

features:
  - title: Entries can't be changed
    details: Every entry has an index in a Merkle tree. Anyone can check an inclusion proof against a signed checkpoint.
  - title: History can't be rewritten
    details: Consistency proofs show each checkpoint extends the last. Witnesses cosign, so everyone sees the same log.
  - title: Reads are static files
    details: The C2SP tlog-tiles layout serves from S3, R2, a CDN or nginx. The writer never handles a read.
  - title: Runs where your code runs
    details: Node, Deno, Bun, Cloudflare Workers and browsers. Drivers for local disk, AWS (S3 + DynamoDB) and Cloudflare (R2 + D1).
  - title: Interoperates with Tessera
    details: CI checks both directions against Tessera's Go code, covering logs, witnessing, migration and static CT.
  - title: Docs that can't rot
    details: Every code sample on this site is a type-checked file, and CI fails if a sample drifts.
---

## Thirty seconds

```sh
npm install @tessellog/core @tessellog/appender @tessellog/client
```

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

Swap the memory driver for disk or the cloud, add [`@tessellog/http`](/guides/personalities) to serve it over HTTP, and you have a production log. Next: [Getting started](/guides/getting-started).
