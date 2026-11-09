import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { parseSignerKey } from "@tessellog/core";
import { prepareAwsLog, startAwsLog } from "../src/index.js";

const USAGE = `usage: aws-log --bucket NAME --table NAME --private-key FILE
               [--port 2024] [--host 127.0.0.1] [--region us-east-1]
               [--endpoint http://127.0.0.1:4566] [--prepare]

Credentials come from the usual AWS chain (environment, profile, instance role).
--endpoint points at an S3/DynamoDB emulator such as Floci; --prepare creates
the bucket and table if they do not exist.`;
const USAGE_EXIT_CODE = 2;

const { values } = parseArgs({
  options: {
    bucket: { type: "string" },
    table: { type: "string" },
    "private-key": { type: "string" },
    port: { type: "string", default: "2024" },
    host: { type: "string", default: "127.0.0.1" },
    region: { type: "string" },
    endpoint: { type: "string" },
    prepare: { type: "boolean", default: false },
  },
});

const { bucket, table, endpoint, region } = values;
const privateKeyFile = values["private-key"];
if (bucket === undefined || table === undefined || privateKeyFile === undefined) {
  console.error(USAGE);
  process.exit(USAGE_EXIT_CODE);
}

const signer = parseSignerKey((await readFile(privateKeyFile, "utf8")).trim());
if (!signer.ok) {
  console.error(`invalid private key in ${privateKeyFile}: ${signer.error}`);
  process.exit(1);
}

const clientConfig = {
  ...(region === undefined ? {} : { region }),
  ...(endpoint === undefined ? {} : { endpoint }),
};
const resources = {
  s3: new S3Client({ ...clientConfig, forcePathStyle: endpoint !== undefined }),
  dynamo: new DynamoDBClient(clientConfig),
  bucket,
  table,
};

if (values.prepare) {
  await prepareAwsLog(resources);
}

const log = await startAwsLog({ ...resources, signer: signer.value, port: Number(values.port), host: values.host });
console.log(`serving ${signer.value.name} at ${log.url}; tiles are in s3://${bucket}/`);

const stop = async (): Promise<void> => {
  await log.close();
  process.exit(0);
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
