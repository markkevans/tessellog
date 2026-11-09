import { randomUUID } from "node:crypto";
import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  type AttributeValue,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import type { TreeState } from "@tessellog/appender";
import { rootHash } from "@tessellog/core";
import {
  decodeEntries,
  encodeEntries,
  type Coordinator,
  type ObjectStore,
} from "@tessellog/driver-object-store";
import { z } from "zod";
import { ignoring, isAwsError, NumberAttribute } from "./dynamo.js";

type Item = Readonly<Record<string, AttributeValue>>;

const BinaryAttribute = z.object({ B: z.instanceof(Uint8Array) }).transform(({ B }) => B);
const StringAttribute = z.object({ S: z.string() }).transform(({ S }) => S);

const CounterItem = z.object({ next: NumberAttribute });
const StateItem = z.object({ size: NumberAttribute, root: BinaryAttribute });
const BatchItem = z
  .object({ sk: NumberAttribute, key: StringAttribute })
  .transform(({ sk, key }) => ({ firstIndex: sk, key }));
const BatchItems = z.array(BatchItem);

type Batch = z.output<typeof BatchItem>;

const DEFAULT_PAGE_SIZE = 100;
const COUNTER = { pk: { S: "counter" }, sk: { N: "0" } };
const STATE = { pk: { S: "state" }, sk: { N: "0" } };

export const createDynamoCoordinator = async ({
  client,
  table,
  payloads,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  readonly client: DynamoDBClient;
  readonly table: string;
  readonly payloads: ObjectStore;
  readonly pageSize?: number;
}): Promise<Coordinator> => {
  const createIfAbsent = (item: Item) =>
    client
      .send(new PutItemCommand({ TableName: table, Item: item, ConditionExpression: "attribute_not_exists(pk)" }))
      .catch(ignoring("ConditionalCheckFailedException"));
  await createIfAbsent({ ...COUNTER, next: { N: "0" } });
  await createIfAbsent({ ...STATE, size: { N: "0" }, root: { B: rootHash([]) } });

  const read = async (key: Item): Promise<Item | undefined> =>
    (await client.send(new GetItemCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;

  const reserve = async (count: number, key: string): Promise<bigint> => {
    const first = CounterItem.parse(await read(COUNTER)).next;
    const committed = await client
      .send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Update: {
                TableName: table,
                Key: COUNTER,
                UpdateExpression: "SET #next = :after",
                ConditionExpression: "#next = :before",
                ExpressionAttributeNames: { "#next": "next" },
                ExpressionAttributeValues: {
                  ":before": { N: first.toString() },
                  ":after": { N: (first + BigInt(count)).toString() },
                },
              },
            },
            {
              Put: {
                TableName: table,
                Item: { pk: { S: "batch" }, sk: { N: first.toString() }, key: { S: key } },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          ],
        }),
      )
      .then(
        () => true,
        (error: unknown) => {
          if (isAwsError(error, "TransactionCanceledException")) {
            return false;
          }
          throw error;
        },
      );
    return committed ? first : reserve(count, key);
  };

  const queryBatches = async (
    condition: string,
    values: Item,
    forward: boolean,
    limit: number | undefined,
    start?: Item,
  ): Promise<readonly Batch[]> => {
    const page = await client.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: `pk = :batch AND ${condition}`,
        ExpressionAttributeValues: { ":batch": { S: "batch" }, ...values },
        ScanIndexForward: forward,
        Limit: limit ?? pageSize,
        ConsistentRead: true,
        ...(start === undefined ? {} : { ExclusiveStartKey: start }),
      }),
    );
    const batches = BatchItems.parse(page.Items);
    return limit !== undefined || page.LastEvaluatedKey === undefined
      ? batches
      : [...batches, ...(await queryBatches(condition, values, forward, limit, page.LastEvaluatedKey))];
  };

  const entriesOf = async ({ firstIndex, key }: Batch, fromIndex: bigint): Promise<readonly Uint8Array[]> => {
    const stored = await payloads.get(key);
    if (stored === undefined) {
      throw new Error(`missing sequenced batch ${key}`);
    }
    const entries = decodeEntries(key, stored);
    return entries.slice(Number(fromIndex > firstIndex ? fromIndex - firstIndex : 0n));
  };

  return {
    sequence: async (entries) => {
      const key = `.state/sequenced/${randomUUID()}`;
      await payloads.put(key, encodeEntries(entries));
      return reserve(entries.length, key);
    },
    readSequenced: async (fromIndex) => {
      const from = { ":from": { N: fromIndex.toString() } };
      const containing = await queryBatches("sk <= :from", from, false, 1);
      const later = await queryBatches("sk > :from", from, true, undefined);
      const parts = await Promise.all([...containing, ...later].map((batch) => entriesOf(batch, fromIndex)));
      return parts.flat();
    },
    readTreeState: async (): Promise<TreeState> => {
      const { size, root } = StateItem.parse(await read(STATE));
      return { size, rootHash: root };
    },
    advanceTreeState: (expectedSize, next) =>
      client
        .send(
          new UpdateItemCommand({
            TableName: table,
            Key: STATE,
            UpdateExpression: "SET #size = :next, #root = :root",
            ConditionExpression: "#size = :expected",
            ExpressionAttributeNames: { "#size": "size", "#root": "root" },
            ExpressionAttributeValues: {
              ":next": { N: next.size.toString() },
              ":root": { B: next.rootHash },
              ":expected": { N: expectedSize.toString() },
            },
          }),
        )
        .then(
          () => true,
          (error: unknown) => {
            if (isAwsError(error, "ConditionalCheckFailedException")) {
              return false;
            }
            throw error;
          },
        ),
  };
};
