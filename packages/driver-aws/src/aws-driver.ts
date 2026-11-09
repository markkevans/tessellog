import type { BundleAddress } from "@tessellog/core";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { S3Client } from "@aws-sdk/client-s3";
import { createLeasedDriver, type LeasedDriver } from "@tessellog/driver-object-store";
import { createDynamoCoordinator } from "./dynamo-coordinator.js";
import { acquireLease } from "./lease.js";
import { createS3ObjectStore } from "./s3-object-store.js";

const DEFAULT_LEASE_DURATION_MS = 60_000;

export type AwsDriverOptions = {
  readonly s3: S3Client;
  readonly bucket: string;
  readonly dynamo: DynamoDBClient;
  readonly table: string;
  readonly leaseDuration?: number;
  readonly clock?: () => number;
  readonly entriesPath?: (address: BundleAddress) => string;
};

export type AwsDriver = LeasedDriver;

export const openAwsDriver = async ({
  s3,
  bucket,
  dynamo,
  table,
  leaseDuration = DEFAULT_LEASE_DURATION_MS,
  clock = Date.now,
  entriesPath,
}: AwsDriverOptions): Promise<AwsDriver> => {
  const objects = createS3ObjectStore({ client: s3, bucket });
  const coordinator = await createDynamoCoordinator({ client: dynamo, table, payloads: objects });
  const lease = await acquireLease({ client: dynamo, table, duration: leaseDuration, clock });
  return createLeasedDriver({ objects, coordinator, lease, entriesPath });
};
