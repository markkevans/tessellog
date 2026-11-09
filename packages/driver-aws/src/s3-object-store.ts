import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectStore } from "@tessellog/driver-object-store";

const DELETE_BATCH = 1000;

const chunks = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const isMissingKey = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "name" in error && error.name === "NoSuchKey";

export const createS3ObjectStore = ({
  client,
  bucket,
}: {
  readonly client: S3Client;
  readonly bucket: string;
}): ObjectStore => ({
  get: async (key) => {
    const response = await client
      .send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      .catch((error: unknown) => {
        if (isMissingKey(error)) {
          return undefined;
        }
        throw error;
      });
    return response?.Body === undefined ? undefined : new Uint8Array(await response.Body.transformToByteArray());
  },
  put: async (key, data) => {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data }));
  },
  delete: async (key) => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
  deleteMany: async (keys) => {
    const results = await Promise.all(
      chunks(keys, DELETE_BATCH).map((batch) =>
        client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        ),
      ),
    );
    const failed = results.flatMap(({ Errors }) => Errors ?? []);
    if (failed.length > 0) {
      throw new Error(`could not delete ${failed.length} objects, first ${failed[0]?.Key}: ${failed[0]?.Code}`);
    }
  },
});
