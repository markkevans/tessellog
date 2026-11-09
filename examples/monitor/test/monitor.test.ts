import { createAppender, createMemoryDriver, type Appender } from "@tessellog/appender";
import { createLogClient, type LogFetcher, type StreamedEntry } from "@tessellog/client";
import {
  generateNoteKey,
  parseSignerKey,
  parseVerifierKey,
  type Checkpoint,
  type NoteKeyPair,
  type Result,
} from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { createMonitor } from "../src/index.js";

const ORIGIN = "example.com/monitored";

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const logWith = async (keys: NoteKeyPair, texts: readonly string[]): Promise<Appender> => {
  const appender = createAppender({
    driver: createMemoryDriver(),
    signer: unwrap(parseSignerKey(keys.signerKey)),
    batching: { maxSize: 1 },
  });
  await appendTo(appender, texts);
  return appender;
};

const appendTo = async (appender: Appender, texts: readonly string[]): Promise<void> => {
  const added = await Promise.all(texts.map((text) => appender.add(bytes(text))));
  const last = added.at(-1);
  await (last === undefined ? Promise.resolve() : appender.awaitPublication(last.index));
};

const switchableFetcher = (initial: LogFetcher) => {
  let current = initial;
  const fetcher: LogFetcher = {
    readCheckpoint: () => current.readCheckpoint(),
    readTile: (address) => current.readTile(address),
    readEntryBundle: (address) => current.readEntryBundle(address),
  };
  return { fetcher, switchTo: (next: LogFetcher) => (current = next) };
};

const monitorOf = (
  fetcher: LogFetcher,
  keys: NoteKeyPair,
  trusted?: Checkpoint,
) => {
  const seen: StreamedEntry[] = [];
  const monitor = createMonitor({
    client: createLogClient({ fetcher, origin: ORIGIN, logVerifier: unwrap(parseVerifierKey(keys.verifierKey)) }),
    ...(trusted === undefined ? {} : { trusted }),
    onEntry: async (entry) => {
      seen.push(entry);
    },
  });
  return { monitor, seen };
};

const texts = (seen: readonly StreamedEntry[]) => seen.map(({ index, entry }) => [index, new TextDecoder().decode(entry)]);

const keysFor = () => unwrap(generateNoteKey({ name: ORIGIN }));

describe("monitoring a log", () => {
  it("reports every entry of a log it has never seen, in order", async () => {
    const keys = keysFor();
    const log = await logWith(keys, ["a", "b", "c"]);
    const { monitor, seen } = monitorOf(log.reader, keys);
    const polled = unwrap(await monitor.poll());
    expect(polled.checkpoint.size).toBe(3n);
    expect(polled.newEntries).toBe(3n);
    expect(texts(seen)).toEqual([
      [0n, "a"],
      [1n, "b"],
      [2n, "c"],
    ]);
    expect(monitor.trusted()).toEqual(polled.checkpoint);
    await log.shutdown();
  });

  it("reports only entries added since the last poll", async () => {
    const keys = keysFor();
    const log = await logWith(keys, ["a", "b"]);
    const { monitor, seen } = monitorOf(log.reader, keys);
    await monitor.poll();
    await appendTo(log, ["c", "d"]);
    expect(unwrap(await monitor.poll()).newEntries).toBe(2n);
    expect(texts(seen).slice(2)).toEqual([
      [2n, "c"],
      [3n, "d"],
    ]);
    await log.shutdown();
  });

  it("reports nothing when the log has not grown", async () => {
    const keys = keysFor();
    const log = await logWith(keys, ["a"]);
    const { monitor } = monitorOf(log.reader, keys);
    await monitor.poll();
    expect(unwrap(await monitor.poll()).newEntries).toBe(0n);
    await log.shutdown();
  });

  it("resumes from a checkpoint it trusted before", async () => {
    const keys = keysFor();
    const log = await logWith(keys, ["a", "b"]);
    const first = monitorOf(log.reader, keys);
    const trusted = unwrap(await first.monitor.poll()).checkpoint;
    await appendTo(log, ["c"]);
    const resumed = monitorOf(log.reader, keys, trusted);
    await resumed.monitor.poll();
    expect(texts(resumed.seen)).toEqual([[2n, "c"]]);
    await log.shutdown();
  });

  it("raises the alarm when the log forks, and keeps trusting the last good checkpoint", async () => {
    const keys = keysFor();
    const honest = await logWith(keys, ["a", "b"]);
    const forked = await logWith(keys, ["a", "x", "y"]);
    const { fetcher, switchTo } = switchableFetcher(honest.reader);
    const { monitor, seen } = monitorOf(fetcher, keys);
    const trusted = unwrap(await monitor.poll()).checkpoint;
    switchTo(forked.reader);
    const polled = await monitor.poll();
    expect(polled.ok).toBe(false);
    expect(polled.ok ? "" : polled.error).toMatch(/^log is inconsistent with the trusted checkpoint of size 2: /);
    expect(monitor.trusted()).toEqual(trusted);
    expect(seen).toHaveLength(2);
    await honest.shutdown();
    await forked.shutdown();
  });

  it("raises the alarm when the log shrinks", async () => {
    const keys = keysFor();
    const longer = await logWith(keys, ["a", "b", "c"]);
    const shorter = await logWith(keys, ["a"]);
    const { fetcher, switchTo } = switchableFetcher(longer.reader);
    const { monitor } = monitorOf(fetcher, keys);
    await monitor.poll();
    switchTo(shorter.reader);
    expect((await monitor.poll()).ok).toBe(false);
    await longer.shutdown();
    await shorter.shutdown();
  });

  it("refuses a checkpoint it cannot verify", async () => {
    const keys = keysFor();
    const log = await logWith(keys, ["a"]);
    const { monitor, seen } = monitorOf(log.reader, keysFor());
    expect((await monitor.poll()).ok).toBe(false);
    expect(monitor.trusted()).toBeUndefined();
    expect(seen).toEqual([]);
    await log.shutdown();
  });

  it("refuses entries that do not match the checkpoint, and does not advance", async () => {
    const keys = keysFor();
    const log = await logWith(keys, ["a", "b"]);
    const tampered: LogFetcher = {
      ...log.reader,
      readEntryBundle: async (address) => {
        const bundle = await log.reader.readEntryBundle(address);
        return bundle?.map((byte) => (byte === "b".charCodeAt(0) ? "z".charCodeAt(0) : byte));
      },
    };
    const { monitor } = monitorOf(tampered, keys);
    const polled = await monitor.poll();
    expect(polled.ok).toBe(false);
    expect(monitor.trusted()).toBeUndefined();
    await log.shutdown();
  });
});
