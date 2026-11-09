import { randomUUID } from "node:crypto";
import type { TreeState } from "@tessellog/appender";
import { rootHash } from "@tessellog/core";
import {
  decodeEntries,
  encodeEntries,
  type Coordinator,
  type ObjectStore,
} from "@tessellog/driver-object-store";
import { z } from "zod";
import type { D1DatabaseLike } from "./bindings.js";
import { Blob, Count } from "./rows.js";

const StateRow = z.object({ size: Count, root: Blob });
const FirstIndexRow = z.object({ first_index: Count });
const BatchRows = z.object({
  results: z.array(z.object({ first_index: Count, payload: z.string() })),
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tessellog_state (
     id INTEGER PRIMARY KEY CHECK (id = 0),
     next INTEGER NOT NULL,
     size INTEGER NOT NULL,
     root BLOB NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tessellog_batches (
     first_index INTEGER PRIMARY KEY,
     count INTEGER NOT NULL,
     payload TEXT NOT NULL
   )`,
];

export const createD1Coordinator = async ({
  db,
  payloads,
}: {
  readonly db: D1DatabaseLike;
  readonly payloads: ObjectStore;
}): Promise<Coordinator> => {
  await db.batch([
    ...SCHEMA.map((sql) => db.prepare(sql)),
    db.prepare("INSERT OR IGNORE INTO tessellog_state (id, next, size, root) VALUES (0, 0, 0, ?)").bind(rootHash([])),
  ]);

  const entriesOf = async (firstIndex: bigint, payload: string, fromIndex: bigint) => {
    const stored = await payloads.get(payload);
    if (stored === undefined) {
      throw new Error(`missing sequenced batch ${payload}`);
    }
    return decodeEntries(payload, stored).slice(Number(fromIndex > firstIndex ? fromIndex - firstIndex : 0n));
  };

  return {
    sequence: async (entries) => {
      const payload = `.state/sequenced/${randomUUID()}`;
      await payloads.put(payload, encodeEntries(entries));
      const [inserted] = await db.batch([
        db
          .prepare(
            "INSERT INTO tessellog_batches (first_index, count, payload) SELECT next, ?, ? FROM tessellog_state WHERE id = 0 RETURNING first_index",
          )
          .bind(entries.length, payload),
        db.prepare("UPDATE tessellog_state SET next = next + ? WHERE id = 0").bind(entries.length),
      ]);
      const row = z.object({ results: z.tuple([FirstIndexRow]) }).parse(inserted);
      return row.results[0].first_index;
    },
    readSequenced: async (fromIndex) => {
      const rows = BatchRows.parse(
        await db
          .prepare(
            "SELECT first_index, payload FROM tessellog_batches WHERE first_index + count > ? ORDER BY first_index",
          )
          .bind(Number(fromIndex))
          .all(),
      );
      const parts = await Promise.all(
        rows.results.map(({ first_index, payload }) => entriesOf(first_index, payload, fromIndex)),
      );
      return parts.flat();
    },
    readTreeState: async (): Promise<TreeState> => {
      const { size, root } = StateRow.parse(
        await db.prepare("SELECT size, root FROM tessellog_state WHERE id = 0").first(),
      );
      return { size, rootHash: root };
    },
    advanceTreeState: async (expectedSize, next) => {
      const { meta } = await db
        .prepare("UPDATE tessellog_state SET size = ?, root = ? WHERE id = 0 AND size = ?")
        .bind(Number(next.size), next.rootHash, Number(expectedSize))
        .run();
      return meta.changes === 1;
    },
  };
};
