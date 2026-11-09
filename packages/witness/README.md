# @tessellog/witness

A C2SP [tlog-witness](https://c2sp.org/tlog-witness). It:
- checks that each new checkpoint is consistent with the last one it saw;
- cosigns with Ed25519 `cosignature/v1`.

It also provides the client logs use to submit checkpoints to witnesses.

```sh
npm install @tessellog/witness @tessellog/core
```

<!-- snippet: witnessing/witness.ts -->
```ts
import { parseCosignerKey, parseVerifierKey } from "@tessellog/core";
import { openPosixWitnessStore } from "@tessellog/driver-posix";
import { serveNode } from "@tessellog/http/node";
import { createWitness } from "@tessellog/witness";

const cosigner = parseCosignerKey(process.env["WITNESS_PRIVATE_KEY"] ?? "");
const log = parseVerifierKey("example.com/my-log+afda4ace+AcOem5yfbPSq9fNpNGwfDJ+fU8XvGDaJweXRm65tp4RB");
if (!cosigner.ok || !log.ok) throw new Error("bad witness configuration");

const witness = createWitness({
  cosigners: [cosigner.value],
  logs: [{ origin: log.value.name, verifiers: [log.value] }],
  store: await openPosixWitnessStore({ root: "./witness-state" }),
});

await serveNode({ handler: witness.handle, port: 2025, host: "0.0.0.0", onError: console.error });
```

## API

- `createWitness({ cosigners, logs, store })` returns `{ handle }`, a fetch-style handler for `POST …/add-checkpoint`. It answers 400, 404, 403, 409 or 422 exactly as the spec orders.
- `createWitnessClient({ url, verifier, fetch? })` submits checkpoints with consistency proofs, retries once after a 409, and returns only verified cosignatures.
- `createMemoryWitnessStore()` is for tests. For production, use `openPosixWitnessStore` from `@tessellog/driver-posix`, or your own `WitnessStore` checked with `describeWitnessStore`.

The witness cosigns only after an atomic compare-and-swap on its store, so racing submissions can't both win.

Guide: [witnessing](https://github.com/markkevans/tessellog/blob/main/docs/guides/witnessing.md). Example: [`witness-server`](https://github.com/markkevans/tessellog/tree/main/examples/witness-server).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
