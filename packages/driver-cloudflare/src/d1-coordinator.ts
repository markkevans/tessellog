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
const NextRow = z.object({ next: Count });
const PayloadRows = z.object({ results: z.array(z.object({ payload: z.string() })) });
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
      if (entries.length === 0) {
        return NextRow.parse(await db.prepare("SELECT CAST(next AS TEXT) AS next FROM tessellog_state WHERE id = 0").first()).next;
      }
      const payload = `.state/sequenced/${crypto.randomUUID()}`;
      await payloads.put(payload, encodeEntries(entries));
      const [inserted] = await db.batch([
        db
          .prepare(
            "INSERT INTO tessellog_batches (first_index, count, payload) SELECT next, ?, ? FROM tessellog_state WHERE id = 0 RETURNING CAST(first_index AS TEXT) AS first_index",
          )
          .bind(entries.length, payload),
        db.prepare("UPDATE tessellog_state SET next = next + CAST(? AS INTEGER) WHERE id = 0").bind(entries.length),
      ]);
      const row = z.object({ results: z.tuple([FirstIndexRow]) }).parse(inserted);
      return row.results[0].first_index;
    },
    readSequenced: async (fromIndex) => {
      const rows = BatchRows.parse(
        await db
          .prepare(
            "SELECT CAST(first_index AS TEXT) AS first_index, payload FROM tessellog_batches WHERE first_index + count > CAST(? AS INTEGER) ORDER BY first_index",
          )
          .bind(fromIndex.toString())
          .all(),
      );
      const parts = await Promise.all(
        rows.results.map(({ first_index, payload }) => entriesOf(first_index, payload, fromIndex)),
      );
      return parts.flat();
    },
    forgetSequencedBefore: async (size) => {
      const { results } = PayloadRows.parse(
        await db.prepare("SELECT payload FROM tessellog_batches WHERE first_index + count <= CAST(? AS INTEGER)").bind(size.toString()).all(),
      );
      await db.prepare("DELETE FROM tessellog_batches WHERE first_index + count <= CAST(? AS INTEGER)").bind(size.toString()).run();
      await payloads.deleteMany(results.map(({ payload }) => payload));
    },
    readTreeState: async (): Promise<TreeState> => {
      const { size, root } = StateRow.parse(
        await db.prepare("SELECT CAST(size AS TEXT) AS size, root FROM tessellog_state WHERE id = 0").first(),
      );
      return { size, rootHash: root };
    },
    advanceTreeState: async (expectedSize, next) => {
      const { meta } = await db
        .prepare("UPDATE tessellog_state SET size = CAST(? AS INTEGER), root = ? WHERE id = 0 AND size = CAST(? AS INTEGER)")
        .bind(next.size.toString(), next.rootHash, expectedSize.toString())
        .run();
      return meta.changes === 1;
    },
  };
};
