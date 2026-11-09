# aws-log

A log service on AWS. S3 holds tiles and bundles, and DynamoDB sequences. The service only takes writes; **clients verify by reading straight from S3** (or CloudFront).

```sh
# Locally, against Floci (docker compose up -d at the repository root):
AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test \
pnpm --filter @tessellog/example-aws-log start \
  --bucket my-log --table my-log --private-key ./my-log.key \
  --region us-east-1 --endpoint http://127.0.0.1:4566 --prepare

# On AWS: credentials come from the usual chain; create the bucket and table with your infrastructure code.
pnpm --filter @tessellog/example-aws-log start --bucket my-log --table my-log --private-key ./my-log.key
```

- [`src/aws-log.ts`](./src/aws-log.ts): `startAwsLog` runs the service. `prepareAwsLog` creates the bucket and table, and is idempotent.
- [`test/aws-log.test.ts`](./test/aws-log.test.ts) proves entries by reading S3 directly. It also shows a second writer refused while the first holds the lease.

In production, make `checkpoint` and `tile/` public and keep `.state/` private. More: [choosing a storage driver](../../docs/guides/drivers.md#aws-s3-and-dynamodb).
