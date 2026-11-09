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
