import { DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { sha256 } from "@noble/hashes/sha2";
import { describeAntispamStore } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { createDynamoAntispamStore, createTessellogTable } from "../src/index.js";
import { flociDynamo, freshTableName } from "./fixtures/floci.js";

const identity = (text: string): Uint8Array => sha256(new TextEncoder().encode(text));

const freshTable = async () => {
  const client = flociDynamo();
  const table = freshTableName();
  await createTessellogTable({ client, table });
  return { client, table };
};

describeAntispamStore("the DynamoDB antispam store on Floci", async () => {
  const { client, table } = await freshTable();
  return { store: createDynamoAntispamStore({ client, table }), cleanup: async () => client.destroy() };
});

describe("sharing a DynamoDB antispam store", () => {
  it("lets a second store instance see recorded identities and progress", async () => {
    const { client, table } = await freshTable();
    await createDynamoAntispamStore({ client, table }).record([{ identity: identity("a"), index: 4n }], 5n);
    const second = createDynamoAntispamStore({ client, table });
    expect(await second.lookup(identity("a"))).toBe(4n);
    expect(await second.followedSize()).toBe(5n);
    client.destroy();
  });

  it("passes on DynamoDB errors", async () => {
    const { client, table } = await freshTable();
    const store = createDynamoAntispamStore({ client, table });
    await client.send(new DeleteTableCommand({ TableName: table }));
    await expect(store.record([{ identity: identity("a"), index: 0n }], 1n)).rejects.toThrow();
    client.destroy();
  });
});
