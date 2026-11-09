# Static CT

[static-ct-api](https://c2sp.org/static-ct-api) is the tile-based format that modern Certificate Transparency logs use, such as Sunlight and Tessera's CT logs. `@tessellog/static-ct` is its **data layer**:
- certificate and precertificate entries;
- `TileLeaf` data tiles under `tile/data/`;
- `MerkleTreeLeaf` leaf hashing with the `leaf_index` extension;
- RFC 6962 tree-head signatures on checkpoints.

As with Tessera, parsing X.509 chains and serving `add-chain` belong to a CT personality built on top. So do the `issuer/` endpoint and enforcing a log's acceptance policy.

## Writing a static-CT log

<!-- snippet: static-ct/append.ts -->
```ts
import { createAppender } from "@tessellog/appender";
import { createRFC6962Signer } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { encodeCtSubmission, staticCtEntriesPath, staticCtLayout, type CtEntry } from "@tessellog/static-ct";

export const openCtLog = async (p256PrivateKey: Uint8Array) => {
  const signer = createRFC6962Signer({ name: "ct.example.com/2026h1", privateKey: p256PrivateKey });
  if (!signer.ok) throw new Error(signer.error);

  const driver = await openPosixDriver({ root: "./ct-log", entriesPath: staticCtEntriesPath });
  const appender = createAppender({ driver, signer: signer.value, layout: staticCtLayout });

  const submit = (entry: CtEntry) => appender.add(encodeCtSubmission(entry));
  return { appender, submit };
};
```

Three things differ from a tlog-tiles log:
- **Layout.** `staticCtLayout` hashes each entry as an RFC 6962 `MerkleTreeLeaf` that includes its own index. Bundles become `TileLeaf` data tiles, and entries may be up to 256 KiB. Every submission is validated at `add`.
- **Paths.** Bundles live at `tile/data/…`. The driver must be told with `entriesPath: staticCtEntriesPath`, which every driver accepts.
- **Signatures.** Checkpoints carry an RFC 6962 `TreeHeadSignature` (ECDSA P-256, note signature type `0x05`), so existing CT tooling can check them. `rfc6962VerifierKey({ logUrl, publicKey })` formats the verifier key exactly as Go's `RFC6962VerifierString`. `p256PublicKeyInfo(privateKey)` gives the DER public key it needs.

A `CtEntry` is a discriminated union. For a precertificate (`isPrecert: true`), the type requires `precertificate` and `issuerKeyHash`. `encodeCtSubmission(entry)` gives the bytes to pass to `add`. Duplicates are recognised by certificate when antispam is on.

## Reading one

Give the client and fetcher the same layout, and parse the RFC 6962 verifier key:

<!-- snippet: static-ct/read.ts -->
```ts
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseRFC6962VerifierKey } from "@tessellog/core";
import { decodeTileLeaves, staticCtLayout } from "@tessellog/static-ct";

export const certificatesIn = async (baseUrl: string, verifierKey: string) => {
  const logVerifier = parseRFC6962VerifierKey(verifierKey);
  if (!logVerifier.ok) throw new Error(logVerifier.error);

  const client = createLogClient({
    fetcher: createHttpFetcher({ baseUrl, layout: staticCtLayout }),
    origin: logVerifier.value.name,
    logVerifier: logVerifier.value,
    layout: staticCtLayout,
  });
  const latest = await client.latestCheckpoint();
  if (!latest.ok) throw new Error(latest.error);

  for await (const streamed of client.entries({ checkpoint: latest.value.checkpoint })) {
    if (!streamed.ok) throw new Error(streamed.error);
    const decoded = decodeTileLeaves(streamed.value.entry);
    if (decoded.ok) console.log(streamed.value.index, decoded.value[0]?.entry.isPrecert);
  }
};
```

Streamed entries come back as CT submissions, which `decodeTileLeaves` turns back into `CtEntry` values.

## Compatibility

Interop in CI checks both directions:
- **tessellog writes:** Tessera's `ctonly` package produces byte-identical `TileLeaf`s for every entry tessellog writes, and Tessera's client and `formats/note` verify the log.
- **Tessera writes:** tessellog's client verifies a static-CT log written by Tessera's CT appender.

RFC 6962 verification is also tested against a real checkpoint from the Rome static-CT log. RSA keys are not supported, since static CT uses P-256. See [ADR 10](../adr/0010-static-ct.md).
