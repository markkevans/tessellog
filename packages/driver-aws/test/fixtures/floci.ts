import { randomUUID } from "node:crypto";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";

const ENDPOINT = process.env["FLOCI_ENDPOINT"] ?? "http://127.0.0.1:4566";

const clientConfig = {
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
} as const;

export const flociS3 = (): S3Client => new S3Client({ ...clientConfig, forcePathStyle: true });

export const freshBucket = async (client: S3Client): Promise<string> => {
  const bucket = `tessellog-${randomUUID()}`;
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  return bucket;
};

export const FLOCI_CLIENT_CONFIG = clientConfig;
