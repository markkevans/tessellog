import { Miniflare } from "miniflare";
import type { D1DatabaseLike, R2BucketLike } from "../../src/index.js";

export type Cloudflare = {
  readonly bucket: R2BucketLike;
  readonly db: D1DatabaseLike;
  readonly dispose: () => Promise<void>;
};

export const freshCloudflare = async (): Promise<Cloudflare> => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('tessellog') } }",
    r2Buckets: ["LOG"],
    d1Databases: ["DB"],
  });
  return {
    bucket: await mf.getR2Bucket("LOG"),
    db: await mf.getD1Database("DB"),
    dispose: () => mf.dispose(),
  };
};
