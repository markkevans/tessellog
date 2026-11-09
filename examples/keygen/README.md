# keygen

Generates [signed-note](https://c2sp.org/signed-note) keys for a log or a witness, in the same format as Go's `note.GenerateKey`. CI has Tessera sign a log with a key generated here.

```sh
pnpm --filter @tessellog/example-keygen keygen --name example.com/my-log --out ./my-log
```

It writes `my-log.key`, the private key, with mode `0600` and never over an existing file. It writes `my-log.pub` beside it, holding the verifier key. It prints the key's **cosignature** form too, which is how a witness is named in a policy.

- [`src/keygen.ts`](./src/keygen.ts): `writeKeyFiles`, built on `generateNoteKey` from `@tessellog/core`.
- [`test/keygen.test.ts`](./test/keygen.test.ts) runs a log end to end with the generated keys.

More: [keys and signing](../../docs/guides/keys-and-signing.md).
