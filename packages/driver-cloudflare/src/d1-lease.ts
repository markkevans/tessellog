import type { Lease } from "@tessellog/driver-object-store";
import type { D1DatabaseLike } from "./bindings.js";


export const acquireD1Lease = async ({
  db,
  duration,
  clock,
}: {
  readonly db: D1DatabaseLike;
  readonly duration: number;
  readonly clock: () => number;
}): Promise<Lease> => {
  const owner = crypto.randomUUID();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS tessellog_lease (id INTEGER PRIMARY KEY CHECK (id = 0), owner TEXT NOT NULL, expires INTEGER NOT NULL)",
    )
    .run();
  const { meta } = await db
    .prepare(
      `INSERT INTO tessellog_lease (id, owner, expires) VALUES (0, ?, ?)
       ON CONFLICT (id) DO UPDATE SET owner = excluded.owner, expires = excluded.expires
       WHERE tessellog_lease.expires < ?`,
    )
    .bind(owner, clock() + duration, clock())
    .run();
  if (meta.changes !== 1) {
    throw new Error("log is held by another writer");
  }
  return {
    renew: async () => {
      const renewed = await db
        .prepare("UPDATE tessellog_lease SET expires = ? WHERE id = 0 AND owner = ?")
        .bind(clock() + duration, owner)
        .run();
      if (renewed.meta.changes !== 1) {
        throw new Error("lost the single-writer lease");
      }
    },
    release: async () => {
      await db.prepare("DELETE FROM tessellog_lease WHERE id = 0 AND owner = ?").bind(owner).run();
    },
  };
};
