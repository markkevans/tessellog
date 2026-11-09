import { CreateTableCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const createTessellogTable = async ({
  client,
  table,
}: {
  readonly client: DynamoDBClient;
  readonly table: string;
}): Promise<void> => {
  await client.send(
    new CreateTableCommand({
      TableName: table,
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "N" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
};
