import { createAppender, createMemoryDriver, type Appender } from "@tessellog/appender";
import type { Checkpoint } from "@tessellog/core";
import { createLogClient, type LogClient } from "../src/index.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "../test/fixtures/keys.js";

type BenchLog = {
  readonly client: LogClient;
  readonly checkpoint: Checkpoint;
};

type Scenario = {
  readonly name: string;
  readonly from?: bigint;
  readonly to?: bigint;
  readonly runs: number;
};

const ADD_ROUND = 4096;
const RANGE_START = 1234n;
const SIZES = [5_000, 50_000] as const;

const addInRounds = async (appender: Appender, size: number, from = 0): Promise<void> => {
  if (from >= size) {
    return;
  }
  const count = Math.min(ADD_ROUND, size - from);
  const added = await Promise.all(
    Array.from({ length: count }, (_, i) => appender.add(new TextEncoder().encode(`bench entry ${from + i}`))),
  );
  await appender.awaitPublication(added.at(-1)?.index ?? 0n);
  return addInRounds(appender, size, from + count);
};

const benchLog = async (size: number): Promise<BenchLog> => {
  const appender = createAppender({
    driver: createMemoryDriver(),
    signer: logSigner(),
    batching: { maxSize: 256, maxAge: 0 },
    checkpointInterval: 10,
    pushback: { maxOutstanding: ADD_ROUND * 2 },
  });
  await addInRounds(appender, size);
  await appender.shutdown();
  const client = createLogClient({ fetcher: appender.reader, origin: LOG_KEY_NAME, logVerifier: logVerifier() });
  const opened = await client.latestCheckpoint();
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return { client, checkpoint: opened.value.checkpoint };
};

const drain = async ({ client, checkpoint }: BenchLog, { from, to }: Scenario): Promise<number> => {
  const range = { checkpoint, ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) };
  const started = performance.now();
  for await (const streamed of client.entries(range)) {
    if (!streamed.ok) {
      throw new Error(streamed.error);
    }
  }
  return performance.now() - started;
};

const PROOFS = 100;

const proveEach = async ({ client, checkpoint }: BenchLog): Promise<number> => {
  const started = performance.now();
  for (const index of Array.from({ length: PROOFS }, (_, i) => RANGE_START + BigInt(i))) {
    const proved = await client.proveInclusion({
      entry: new TextEncoder().encode(`bench entry ${index}`),
      index,
      checkpoint,
    });
    if (!proved.ok) {
      throw new Error(proved.error);
    }
  }
  return performance.now() - started;
};

const timeRuns = async (log: BenchLog, scenario: Scenario, done: readonly number[] = []): Promise<readonly number[]> =>
  done.length === scenario.runs ? done : timeRuns(log, scenario, [...done, await drain(log, scenario)]);

const median = (times: readonly number[]): number => {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

const scenariosFor = (size: number): readonly Scenario[] => [
  { name: "100 entries", from: RANGE_START, to: RANGE_START + 100n, runs: 9 },
  { name: "1,000 entries", from: RANGE_START, to: RANGE_START + 1000n, runs: 5 },
  { name: `every entry (${size})`, runs: size > 5_000 ? 1 : 3 },
];

const report = async (size: number): Promise<void> => {
  const log = await benchLog(size);
  console.log(`\n${size}-entry log`);
  await proveEach(log);
  const proofTimes = [await proveEach(log), await proveEach(log), await proveEach(log)];
  console.log(`  ${`${PROOFS} inclusion proofs`.padEnd(22)} median ${median(proofTimes).toFixed(1).padStart(9)} ms  (3 runs)`);
  for (const scenario of scenariosFor(size)) {
    await drain(log, scenario);
    const times = await timeRuns(log, scenario);
    console.log(`  ${scenario.name.padEnd(22)} median ${median(times).toFixed(1).padStart(9)} ms  (${scenario.runs} runs)`);
  }
};

for (const size of SIZES) {
  await report(size);
}
