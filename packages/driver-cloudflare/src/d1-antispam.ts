import type { AntispamStore } from "@tessellog/appender";
import { z } from "zod";
import type { D1DatabaseLike } from "./bindings.js";
import { Count } from "./rows.js";

const IndexRow = z.union([z.null(), z.object({ idx: Count })]);
const ProgressRow = z.object({ size: Count });

export const createD1AntispamStore = async ({ db }: { readonly db: D1DatabaseLike }): Promise<AntispamStore> => {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS tessellog_antispam (identity BLOB PRIMARY KEY, idx INTEGER NOT NULL)"),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS tessellog_antispam_progress (id INTEGER PRIMARY KEY CHECK (id = 0), size INTEGER NOT NULL)",
    ),
    db.prepare("INSERT OR IGNORE INTO tessellog_antispam_progress (id, size) VALUES (0, 0)"),
  ]);
  return {
    lookup: async (identity) =>
      IndexRow.parse(await db.prepare("SELECT CAST(idx AS TEXT) AS idx FROM tessellog_antispam WHERE identity = ?").bind(identity).first())
        ?.idx,
    followedSize: async () =>
      ProgressRow.parse(await db.prepare("SELECT CAST(size AS TEXT) AS size FROM tessellog_antispam_progress WHERE id = 0").first()).size,
    record: async (entries, followedSize) => {
      await db.batch([
        ...entries.map(({ identity, index }) =>
          db.prepare("INSERT OR IGNORE INTO tessellog_antispam (identity, idx) VALUES (?, CAST(? AS INTEGER))").bind(identity, index.toString()),
        ),
        db.prepare("UPDATE tessellog_antispam_progress SET size = CAST(? AS INTEGER) WHERE id = 0").bind(followedSize.toString()),
      ]);
    },
  };
};
