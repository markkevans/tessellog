import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openCloudflareDriver, type D1DatabaseLike, type R2BucketLike } from "@tessellog/driver-cloudflare";

type Env = { readonly LOG_BUCKET: R2BucketLike; readonly LOG_DB: D1DatabaseLike };

export const openLogOnCloudflare = async (env: Env, signer: NoteSigner) => {
  const driver = await openCloudflareDriver({ bucket: env.LOG_BUCKET, db: env.LOG_DB, leaseDuration: 15_000 });
  return { driver, appender: createAppender({ driver, signer }) };
};
