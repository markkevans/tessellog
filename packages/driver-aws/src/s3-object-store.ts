import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { ObjectStore } from "@tessellog/driver-object-store";

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
});
