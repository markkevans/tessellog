# @tessellog/static-ct

The [static-ct-api](https://c2sp.org/static-ct-api) data layer for Certificate Transparency logs:
- CT entries;
- `TileLeaf` data tiles;
- `MerkleTreeLeaf` hashing;
- an `EntryLayout` for the appender, client and migration target.

Its output is byte-identical to Tessera's `ctonly`.

```sh
npm install @tessellog/static-ct @tessellog/appender @tessellog/core
```

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

## API

- `staticCtLayout`: pass it as the appender's, client's and fetcher's `layout`.
- `staticCtEntriesPath`: pass it as the driver's `entriesPath` (`tile/data/…`).
- `encodeCtSubmission(entry)`: the bytes to `add`.
- `CtEntry`, a discriminated union that requires precertificate fields when `isPrecert` is true.
- `encodeTileLeaf`, `decodeTileLeaves`, `merkleTreeLeafHash` and `ctIdentity`.

X.509 parsing, `add-chain` and the `issuer/` endpoint belong to the CT personality on top.

Guide: [static CT](https://github.com/markkevans/tessellog/blob/main/docs/guides/static-ct.md).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
