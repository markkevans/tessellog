import type { BundleAddress } from "@tessellog/core";
import { createLeasedDriver, type LeasedDriver } from "@tessellog/driver-object-store";
import type { D1DatabaseLike, R2BucketLike } from "./bindings.js";
import { createD1Coordinator } from "./d1-coordinator.js";
import { acquireD1Lease } from "./d1-lease.js";
import { createR2ObjectStore } from "./r2-object-store.js";

const DEFAULT_LEASE_DURATION_MS = 60_000;

export type CloudflareDriverOptions = {
  readonly bucket: R2BucketLike;
  readonly db: D1DatabaseLike;
  readonly leaseDuration?: number;
  readonly clock?: () => number;
  readonly entriesPath?: (address: BundleAddress) => string;
};

export type CloudflareDriver = LeasedDriver;

export const openCloudflareDriver = async ({
  bucket,
  db,
  leaseDuration = DEFAULT_LEASE_DURATION_MS,
  clock = Date.now,
  entriesPath,
}: CloudflareDriverOptions): Promise<CloudflareDriver> => {
  const objects = createR2ObjectStore({ bucket });
  const coordinator = await createD1Coordinator({ db, payloads: objects });
  const lease = await acquireD1Lease({ db, duration: leaseDuration, clock });
  return createLeasedDriver({ objects, coordinator, lease, entriesPath });
};
