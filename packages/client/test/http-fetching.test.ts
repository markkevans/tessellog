import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpFetcher } from "../src/index.js";
import { BASE_URL, entriesFor, fakeServer, servedLog } from "./fixtures/served-log.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetching a log over HTTP", () => {
  it("reads the checkpoint, tiles and entry bundles", async () => {
    const { files } = await servedLog(entriesFor(300));
    const fetcher = createHttpFetcher({ baseUrl: BASE_URL, fetch: fakeServer(files).fetch });
    expect(await fetcher.readCheckpoint()).toEqual(files.get("checkpoint"));
    expect(await fetcher.readTile({ level: 0, index: 1n, width: 44 })).toEqual(
      files.get("tile/0/001.p/44"),
    );
    expect(await fetcher.readEntryBundle({ index: 0n, width: 256 })).toEqual(
      files.get("tile/entries/000"),
    );
  });

  it("reports resources the server does not have as missing", async () => {
    const fetcher = createHttpFetcher({ baseUrl: BASE_URL, fetch: fakeServer(new Map()).fetch });
    expect(await fetcher.readCheckpoint()).toBeUndefined();
  });

  it("fails with the status and URL when the server errors", async () => {
    const server = fakeServer(new Map(), BASE_URL, () => 503);
    const fetcher = createHttpFetcher({ baseUrl: BASE_URL, fetch: server.fetch });
    await expect(fetcher.readCheckpoint()).rejects.toThrow(
      `GET ${BASE_URL}checkpoint failed with status 503`,
    );
  });

  it("resolves paths under a base URL given without a trailing slash", async () => {
    const server = fakeServer(new Map());
    const fetcher = createHttpFetcher({ baseUrl: "https://log.example/prefix", fetch: server.fetch });
    await fetcher.readTile({ level: 2, index: 1_234_067n, width: 256 });
    expect(server.requested()).toEqual(["https://log.example/prefix/tile/2/x001/x234/067"]);
  });

  it("uses the global fetch when none is given", async () => {
    const { files } = await servedLog(entriesFor(1));
    vi.stubGlobal("fetch", fakeServer(files).fetch);
    const fetcher = createHttpFetcher({ baseUrl: BASE_URL });
    expect(await fetcher.readCheckpoint()).toEqual(files.get("checkpoint"));
  });
});
