# tessellog documentation

tessellog is a TypeScript library for building **tile-based transparency logs**, ported from [Tessera](https://github.com/transparency-dev/tessera). Its logs are append-only and tamper-evident, and anyone can verify them from static files. Logs written by tessellog and by Tessera can each be read and verified by the other.

## Start here

1. [Concepts](./guides/concepts.md): what a transparency log is, the life of an entry, and how tessellog maps to Tessera.
2. [Getting started](./guides/getting-started.md): a working, verified log in about ten minutes.

## Guides

| Guide | Read it when you want to… |
|---|---|
| [Keys and signing](./guides/keys-and-signing.md) | generate keys, rotate them, or sign with more than one key |
| [Choosing a storage driver](./guides/drivers.md) | run on disk, on AWS (S3 + DynamoDB), on Cloudflare (R2 + D1), or on your own storage |
| [Writing a personality](./guides/personalities.md) | put an HTTP API in front of a log and serve it to clients |
| [Verifying and monitoring logs](./guides/verifying.md) | check checkpoints, inclusion and consistency, or watch a log for misbehaviour |
| [Witnessing](./guides/witnessing.md) | get checkpoints cosigned by witnesses, or run a witness |
| [Antispam and deduplication](./guides/antispam.md) | stop the same entry being logged twice |
| [Operating a log](./guides/operations.md) | tune batching, shut down cleanly, collect garbage, freeze a log or migrate one from Tessera |
| [Static CT](./guides/static-ct.md) | build a Certificate Transparency log in the static-ct-api format |

## Examples

Every example in [`examples/`](../examples) is a runnable workspace package with tests. CI runs those tests, so the examples keep working.

| Example | What it shows |
|---|---|
| [`keygen`](../examples/keygen) | generating log and witness keys |
| [`posix-oneshot`](../examples/posix-oneshot) | adding files to a log on disk, like Tessera's `posix-oneshot` |
| [`http-log`](../examples/http-log) | an HTTP log service on the POSIX driver |
| [`aws-log`](../examples/aws-log) | an HTTP log service on S3 and DynamoDB, whose clients read tiles straight from S3 |
| [`cloudflare-worker`](../examples/cloudflare-worker) | a log on a Cloudflare Worker and Durable Object over R2 and D1 |
| [`witness-server`](../examples/witness-server) | a standalone witness with persistent state |
| [`monitor`](../examples/monitor) | watching a log: consistency between checkpoints, and a proof for every entry |

## Reference

- Each package has a README with its API: [`packages/`](../packages).
- Architectural decisions are recorded in [`docs/adr`](./adr).
- The specifications: [tlog-tiles](https://c2sp.org/tlog-tiles), [tlog-checkpoint](https://c2sp.org/tlog-checkpoint), [signed-note](https://c2sp.org/signed-note), [tlog-cosignature](https://c2sp.org/tlog-cosignature), [tlog-witness](https://c2sp.org/tlog-witness), [tlog-policy](https://c2sp.org/tlog-policy) and [static-ct-api](https://c2sp.org/static-ct-api).

## Keeping these docs honest

Every code block in these guides and in the package READMEs comes from a file in [`docs/snippets`](./snippets). Those files are type-checked with the rest of the workspace, the self-contained ones are run in CI, and a test fails if a code block and its file disagree. After editing a snippet, run `pnpm --filter @tessellog/docs sync` to update the markdown.
