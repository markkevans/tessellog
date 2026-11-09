import { createAppender, type Appender } from "@tessellog/appender";
import { createLogClient, type LogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import { generateNoteKey, type Checkpoint, type Result } from "@tessellog/core";
import { describeLogDriver } from "@tessellog/driver-conformance";
import { openPosixDriver, type PosixDriver } from "@tessellog/driver-posix";
import { staticCtLayout } from "@tessellog/static-ct";
import { createWitness, type WitnessStore } from "@tessellog/witness";

export type Smoke = {
  readonly appender: typeof createAppender;
  readonly client: typeof createLogClient;
  readonly fetcher: typeof createFileFetcher;
  readonly keys: typeof generateNoteKey;
  readonly conformance: typeof describeLogDriver;
  readonly posix: typeof openPosixDriver;
  readonly layout: typeof staticCtLayout;
  readonly witness: typeof createWitness;
  readonly types: [Appender, LogClient, Checkpoint, Result<string>, PosixDriver, WitnessStore];
};
