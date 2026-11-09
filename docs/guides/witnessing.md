# Witnessing

A signed checkpoint proves *the log* said something. It does not prove the log said the same thing to everyone. A **split view**, showing one history to some clients and another to the rest, is the attack a log signature alone cannot stop.

**Witnesses** close that gap. A witness:
- remembers the latest checkpoint it has seen for each log;
- cosigns a new checkpoint only if it can verify that the new one extends the old one.

A client that requires cosignatures from a quorum of independent witnesses knows that, unless all of them collude, everyone is seeing the same log.

tessellog implements:
- C2SP [tlog-witness](https://c2sp.org/tlog-witness), the `add-checkpoint` protocol;
- [tlog-cosignature](https://c2sp.org/tlog-cosignature), Ed25519 `cosignature/v1`;
- [tlog-policy](https://c2sp.org/tlog-policy), the quorum rules.

## Policies

A policy names the witnesses and how many must agree:

```
witness W1 example.com/witness+b23d4f67+BEVLyBUt… https://witness.example.com/
witness W2 example.org/witness+c3acd4d0+BEgafMlE… https://witness.example.org/
group either any W1 W2
quorum either
```

- `witness NAME KEY [URL]`: the key is the witness's **cosignature** verifier key (type `0x04`, from `cosignatureVerifierKeyFrom` or `keygen`'s "as a witness" line). The URL is where checkpoints are submitted.
- `group NAME any|all|N MEMBERS…`: groups can contain witnesses or other groups.
- `quorum NAME`: the witness or group that must be satisfied.

`parsePolicy(text)` checks the policy against the spec's rules, such as names defined before use and no duplicate members. It returns a `Result`.

## A log that publishes only witnessed checkpoints

<!-- snippet: witnessing/policy.ts -->
```ts
import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parsePolicy, type NoteSigner, type NoteVerifier } from "@tessellog/core";

const policyText = `
witness W1 example.com/witness+b23d4f67+BEVLyBUt2RhO0bBma3n+Ox0colWVon+MUax/RUnjJ/aa https://witness.example.com/
witness W2 example.org/witness+c3acd4d0+BEgafMlEzlQ0GMmcJUn07hgy9nlILMIEgU3hWixaJy6s https://witness.example.org/
group either any W1 W2
quorum either
`;

const policy = parsePolicy(policyText);
if (!policy.ok) throw new Error(policy.error);

export const witnessedAppender = (signer: NoteSigner) =>
  createAppender({
    driver: createMemoryDriver(),
    signer,
    witnessing: { policy: policy.value, timeout: 2_000 },
  });

export const witnessCheckingClient = (logVerifier: NoteVerifier) =>
  createLogClient({
    fetcher: createHttpFetcher({ baseUrl: "https://log.example.com/" }),
    origin: logVerifier.name,
    logVerifier,
    witnessPolicy: policy.value,
  });
```

At each checkpoint interval, the appender submits the new checkpoint to every witness in the policy in parallel, with a consistency proof from the size each witness last saw. Cosignatures that verify are attached, and the checkpoint is published only when the quorum is met.

- `timeout` (1,000ms by default) bounds each round.
- If the quorum is not met, nothing is published, and the previous checkpoint stays current. `failOpen: true` publishes anyway, with whatever cosignatures arrived. Use it only if availability matters more than split-view protection.
- Every witness in the policy needs a URL. Policies for clients may omit URLs.

On the client side, `witnessPolicy` makes `latestCheckpoint()` fail unless the quorum's cosignatures verify.

## Running a witness

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

`witness.handle` is a fetch-style handler for `POST …/add-checkpoint`. It checks requests in the order the spec requires, answering with these statuses:
- `400`: the request is malformed.
- `404`: the log is unknown.
- `403`: the log's signature is bad.
- `409`: the old size doesn't match. The body carries the size the witness has.
- `422`: the consistency proof is bad.

It cosigns only after an atomic compare-and-swap on its store, so two racing submissions can never both win.

The store matters. A witness that forgets what it has seen can be tricked into cosigning a rollback. `openPosixWitnessStore` keeps each log's latest checkpoint durably and locks its directory against a second process. `createMemoryWitnessStore` is for tests only. Other stores implement `WitnessStore` (`latest` and `advance`) and should pass `describeWitnessStore` from `@tessellog/driver-conformance`.

The [`witness-server`](../../examples/witness-server) example is a complete witness with a CLI.

## Interoperability

CI checks witnessing both ways:
- Tessera's Go `posix-oneshot` is witnessed by tessellog's witness over HTTP, and tessellog's client checks the quorum.
- Go's `formats/note` verifies cosignatures on a tessellog-written log.

## Not yet supported

- **ML-DSA-44 cosignatures** (`0x06`), which the spec recommends for new witnesses. These wait for reference vectors and Tessera support.
- **The optional `sign-subtree` endpoint.**
