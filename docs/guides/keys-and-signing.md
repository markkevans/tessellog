# Keys and signing

tessellog uses C2SP [signed-note](https://c2sp.org/signed-note) keys, the same text format as Go's `golang.org/x/mod/sumdb/note` and Tessera.

```
PRIVATE+KEY+example.com/my-log+afda4ace+AY3j…   ← signer key: keep it secret
example.com/my-log+afda4ace+AcOem5yfbPSq9f…     ← verifier key: publish it
```

Each key has three parts:
- **Name.** For a log key, this is the log's **origin**, the first line of every checkpoint.
- **Key ID.** Eight hex digits that bind the name to the public key.
- **Key material.** The key itself, in base64.

## Generating keys

<!-- snippet: keys/generate.ts -->
```ts
import { cosignatureVerifierKeyFrom, generateNoteKey } from "@tessellog/core";

const keys = generateNoteKey({ name: "example.com/my-log" });
if (!keys.ok) throw new Error(keys.error);

console.log(keys.value.signerKey);
console.log(keys.value.verifierKey);

const asWitness = cosignatureVerifierKeyFrom(keys.value.verifierKey);
if (asWitness.ok) console.log(asWitness.value);
```

`generateNoteKey` gives the same output as Go's `note.GenerateKey`. A test pins it to Go's published vector, and CI has Tessera sign a log with a key generated here. Names may not be empty, contain `+`, or contain whitespace.

The [`keygen`](../../examples/keygen) example does this from the command line. It writes the private key with mode `0600` and refuses to overwrite an existing key.

## Using keys

| You have | Parse it with | You get |
|---|---|---|
| a log's signer key | `parseSignerKey` | a `NoteSigner` for `createAppender({ signer })` |
| a log's verifier key | `parseVerifierKey` | a `NoteVerifier` for `createLogClient({ logVerifier })` |
| a witness's signer key | `parseCosignerKey` | a `NoteSigner` that makes `cosignature/v1` signatures |
| a witness's cosignature key | `parseCosignerVerifierKey` | a `NoteVerifier` for cosignatures |
| a static-CT P-256 private key | `createRFC6962Signer` | a `NoteSigner` making RFC 6962 tree-head signatures |
| a static-CT verifier key | `parseRFC6962VerifierKey` | a `NoteVerifier` for RFC 6962 signatures |

Every parser returns a `Result`, so a malformed key is an error you handle, never an exception.

## Keeping the signer key safe

The signer key is the log's identity. Anyone holding it can sign a different history under your name. Protect it accordingly:
- Load it from a secret store or environment variable, never from source control. With Cloudflare, use `wrangler secret put`. With AWS, use Secrets Manager or SSM Parameter Store.
- Give the writer process alone access to it. Readers and witnesses never need it.
- `NoteSigner` is an interface: a `name`, a `keyId` and an async `sign(message)`. You can implement it against a KMS or HSM, as long as it produces Ed25519 signatures.

## Several signers and key rotation

A checkpoint may carry several signatures. `additionalSigners` adds them. They must use the same name as the main signer, because a note's signatures all speak for the same origin.

<!-- snippet: keys/signers.ts -->
```ts
import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { parseSignerKey, type NoteSigner } from "@tessellog/core";

const signerFrom = (key: string | undefined): NoteSigner => {
  const parsed = parseSignerKey(key ?? "");
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
};

const appender = createAppender({
  driver: createMemoryDriver(),
  signer: signerFrom(process.env["LOG_PRIVATE_KEY"]),
  additionalSigners: [signerFrom(process.env["LOG_NEXT_PRIVATE_KEY"])],
});
await appender.shutdown();
```

To rotate a key without breaking clients:
1. Publish the new verifier key alongside the old one.
2. Sign with both: old as `signer`, new in `additionalSigners`.
3. Once clients trust the new key, swap the roles.
4. Finally drop the old key.

Clients accept any checkpoint signed by their `logVerifier`, and ignore signatures from keys they don't know.

## Witness keys

A witness signs **cosignatures** (`cosignature/v1`, key type `0x04`), not ordinary note signatures. A witness keeps an ordinary signer key and parses it with `parseCosignerKey`. Policies and clients name the witness by its **cosignature verifier key**. `cosignatureVerifierKeyFrom(verifierKey)` derives it, and `keygen` prints it as "as a witness". See [Witnessing](./witnessing.md).
