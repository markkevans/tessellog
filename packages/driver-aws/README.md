# @tessellog/driver-aws

A tessellog driver for AWS:
- S3 holds tiles, bundles and the checkpoint.
- DynamoDB holds sequencing, tree state, the single-writer lease and antispam.

```sh
npm install @tessellog/driver-aws @tessellog/appender @aws-sdk/client-s3 @aws-sdk/client-dynamodb
```

<!-- snippet: drivers/aws.ts -->
```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { createTessellogTable, openAwsDriver } from "@tessellog/driver-aws";

export const openLogOnAws = async (signer: NoteSigner) => {
  const dynamo = new DynamoDBClient({ region: "eu-west-2" });
  await createTessellogTable({ client: dynamo, table: "my-log" });

  const driver = await openAwsDriver({
    s3: new S3Client({ region: "eu-west-2" }),
    bucket: "my-log-tiles",
    dynamo,
    table: "my-log",
  });
  return { driver, appender: createAppender({ driver, signer }) };
};
```

## API

- `openAwsDriver({ s3, bucket, dynamo, table, leaseDuration?, entriesPath? })` returns a `LogDriver` with `close()`.
- `createTessellogTable({ client, table })` creates the single on-demand table.
- `createDynamoAntispamStore({ client, table })` returns an `AntispamStore`.
- `createS3ObjectStore` and `createDynamoCoordinator` are the parts, for use with `@tessellog/driver-object-store`.

Batches are recorded with one conditional transaction, so a crash can leave an unused S3 object but never a gap in the indices. Serve reads from the bucket or CloudFront, and keep `.state/` private.

Guide: [choosing a storage driver](https://github.com/markkevans/tessellog/blob/main/docs/guides/drivers.md). Example: [`aws-log`](https://github.com/markkevans/tessellog/tree/main/examples/aws-log).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
