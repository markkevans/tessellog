import { GetItemCommand, PutItemCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { AntispamStore } from "@tessellog/appender";
import { toHex } from "@tessellog/core";
import { z } from "zod";
import { ignoring } from "./dynamo.js";

const FOLLOWED = { pk: { S: "antispam-followed" }, sk: { N: "0" } };

const IndexItem = z
  .object({ index: z.object({ N: z.string().regex(/^(0|[1-9][0-9]*)$/) }) })
  .transform(({ index }) => BigInt(index.N));

const FollowedItem = z
  .object({ size: z.object({ N: z.string().regex(/^(0|[1-9][0-9]*)$/) }) })
  .transform(({ size }) => BigInt(size.N));

const identityKey = (identity: Uint8Array) => ({ pk: { S: `antispam#${toHex(identity)}` }, sk: { N: "0" } });

export const createDynamoAntispamStore = ({
  client,
  table,
}: {
  readonly client: DynamoDBClient;
  readonly table: string;
}): AntispamStore => {
  const read = async (key: ReturnType<typeof identityKey>) =>
    (await client.send(new GetItemCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;
  return {
    lookup: async (identity) => {
      const item = await read(identityKey(identity));
      return item === undefined ? undefined : IndexItem.parse(item);
    },
    followedSize: async () => {
      const item = await read(FOLLOWED);
      return item === undefined ? 0n : FollowedItem.parse(item);
    },
    record: async (entries, followedSize) => {
      await Promise.all(
        entries.map(({ identity, index }) =>
          client
            .send(
              new PutItemCommand({
                TableName: table,
                Item: { ...identityKey(identity), index: { N: index.toString() } },
                ConditionExpression: "attribute_not_exists(pk)",
              }),
            )
            .catch(ignoring("ConditionalCheckFailedException")),
        ),
      );
      await client.send(
        new PutItemCommand({ TableName: table, Item: { ...FOLLOWED, size: { N: followedSize.toString() } } }),
      );
    },
  };
};
