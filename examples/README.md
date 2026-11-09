# Examples

Each example is a workspace package with tests, which CI runs.

| Example | Shows |
|---|---|
| [`keygen`](./keygen) | generating log and witness keys |
| [`posix-oneshot`](./posix-oneshot) | adding files to a log on disk |
| [`http-log`](./http-log) | an HTTP log service on local disk |
| [`aws-log`](./aws-log) | an HTTP log service on S3 and DynamoDB, whose clients read from S3 |
| [`cloudflare-worker`](./cloudflare-worker) | a Worker and Durable Object over R2 and D1 |
| [`witness-server`](./witness-server) | a standalone witness with persistent state |
| [`monitor`](./monitor) | watching a log for forks, rollbacks and unprovable entries |

Run them from the repository root after `pnpm install`. A CLI run without arguments prints its usage. For example: `pnpm --filter @tessellog/example-http-log start`.
