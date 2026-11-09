import type { NoteVerifier, Policy } from "@tessellog/core";
import { createHttpFetcher, createLogClient, type LogClient } from "../../src/index.js";
import { LOG_KEY_NAME, logVerifier } from "./keys.js";
import { BASE_URL, fakeServer } from "./served-log.js";

export const clientFor = (
  files: ReadonlyMap<string, Uint8Array>,
  overrides?: {
    readonly origin?: string;
    readonly logVerifier?: NoteVerifier;
    readonly witnessPolicy?: Policy;
  },
): LogClient =>
  createLogClient({
    fetcher: createHttpFetcher({ baseUrl: BASE_URL, fetch: fakeServer(files).fetch }),
    origin: LOG_KEY_NAME,
    logVerifier: logVerifier(),
    ...overrides,
  });
