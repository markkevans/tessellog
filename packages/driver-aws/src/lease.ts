import { randomUUID } from "node:crypto";
import {
  DeleteItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { ignoring, replacing } from "./dynamo.js";

const LEASE = { pk: { S: "lease" }, sk: { N: "0" } };
const CONDITION_FAILED = "ConditionalCheckFailedException";

export type Lease = {
  readonly renew: () => Promise<void>;
  readonly release: () => Promise<void>;
};

export const acquireLease = async ({
  client,
  table,
  duration,
  clock,
}: {
  readonly client: DynamoDBClient;
  readonly table: string;
  readonly duration: number;
  readonly clock: () => number;
}): Promise<Lease> => {
  const owner = { S: randomUUID() };
  const expiry = () => ({ N: String(clock() + duration) });
  await client
    .send(
      new PutItemCommand({
        TableName: table,
        Item: { ...LEASE, owner, expires: expiry() },
        ConditionExpression: "attribute_not_exists(pk) OR expires < :now",
        ExpressionAttributeValues: { ":now": { N: String(clock()) } },
      }),
    )
    .catch(replacing(CONDITION_FAILED, () => new Error("log is held by another writer")));
  return {
    renew: async () => {
      await client
        .send(
          new UpdateItemCommand({
            TableName: table,
            Key: LEASE,
            UpdateExpression: "SET expires = :expires",
            ConditionExpression: "#owner = :owner",
            ExpressionAttributeNames: { "#owner": "owner" },
            ExpressionAttributeValues: { ":expires": expiry(), ":owner": owner },
          }),
        )
        .catch(replacing(CONDITION_FAILED, () => new Error("lost the single-writer lease")));
    },
    release: async () => {
      await client
        .send(
          new DeleteItemCommand({
            TableName: table,
            Key: LEASE,
            ConditionExpression: "#owner = :owner",
            ExpressionAttributeNames: { "#owner": "owner" },
            ExpressionAttributeValues: { ":owner": owner },
          }),
        )
        .catch(ignoring(CONDITION_FAILED));
    },
  };
};
