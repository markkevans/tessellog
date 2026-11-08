import { describe, expect, it } from "vitest";
import { createAppender, createMemoryDriver } from "../src/index.js";

const entry = (text: string): Uint8Array => new TextEncoder().encode(text);

const newAppender = () => createAppender({ driver: createMemoryDriver() });

describe("appending entries", () => {
  it("assigns contiguous indices from zero", async () => {
    const appender = newAppender();
    const indices = [
      await appender.add(entry("first")),
      await appender.add(entry("second")),
      await appender.add(entry("third")),
    ];
    expect(indices).toEqual([
      { index: 0n, isDup: false },
      { index: 1n, isDup: false },
      { index: 2n, isDup: false },
    ]);
  });

  it("assigns distinct indices to concurrent adds", async () => {
    const appender = newAppender();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => appender.add(entry(`entry ${i}`))),
    );
    expect(results.map(({ index }) => index).sort((a, b) => Number(a - b))).toEqual(
      Array.from({ length: 10 }, (_, i) => BigInt(i)),
    );
  });
});
