import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CreateBucketCommand, type S3Client } from "@aws-sdk/client-s3";
import { createAppender, type AppenderOptions } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { createTessellogTable, openAwsDriver } from "@tessellog/driver-aws";
import { createLogHandler } from "@tessellog/http";
import { serveNode } from "@tessellog/http/node";

export type AwsResources = {
  readonly s3: S3Client;
  readonly dynamo: DynamoDBClient;
  readonly bucket: string;
  readonly table: string;
};

export type AwsLogOptions = AwsResources & {
  readonly signer: NoteSigner;
  readonly port?: number;
  readonly host?: string;
  readonly appender?: Partial<Omit<AppenderOptions, "driver" | "signer">>;
  readonly onError?: (error: unknown) => void;
};

export type AwsLog = {
  readonly url: string;
  readonly close: () => Promise<void>;
};

const DEFAULT_PORT = 2024;
const DEFAULT_HOST = "127.0.0.1";
const ALREADY_EXISTS = new Set(["BucketAlreadyOwnedByYou", "ResourceInUseException"]);

const unlessAlreadyExists = (error: unknown): void => {
  if (!(error instanceof Error && ALREADY_EXISTS.has(error.name))) {
    throw error;
  }
};

export const prepareAwsLog = async ({ s3, dynamo, bucket, table }: AwsResources): Promise<void> => {
  await s3.send(new CreateBucketCommand({ Bucket: bucket })).catch(unlessAlreadyExists);
  await createTessellogTable({ client: dynamo, table }).catch(unlessAlreadyExists);
};

export const startAwsLog = async ({
  s3,
  dynamo,
  bucket,
  table,
  signer,
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  appender: appenderOptions = {},
  onError = console.error,
}: AwsLogOptions): Promise<AwsLog> => {
  const driver = await openAwsDriver({ s3, bucket, dynamo, table });
  const appender = createAppender({ ...appenderOptions, driver, signer });
  const server = await serveNode({ handler: createLogHandler({ appender, onError }), port, host, onError });
  return {
    url: server.url,
    close: async () => {
      await server.close();
      await appender.shutdown();
      await driver.close();
    },
  };
};
