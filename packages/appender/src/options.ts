import type { NoteSigner } from "@tessellog/core";
import { z } from "zod";
import type { AntispamStore } from "./antispam-store.js";
import type { LogDriver } from "./driver.js";

const DRIVER_METHODS = [
  "sequence",
  "readSequenced",
  "readTreeState",
  "readTile",
  "readEntryBundle",
  "writeIntegration",
  "readCheckpoint",
  "writeCheckpoint",
] as const;

const SINGLE_LINE_WITHOUT_CONTROL_CHARACTERS = /^[^\x00-\x1f]+$/;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const driverSchema = z.custom<LogDriver>(
  (value) =>
    isRecord(value) && DRIVER_METHODS.every((method) => typeof value[method] === "function"),
  { message: "driver must implement every LogDriver method" },
);

const signerSchema = z.custom<NoteSigner>(
  (value) =>
    isRecord(value) &&
    typeof value["name"] === "string" &&
    typeof value["keyId"] === "number" &&
    typeof value["sign"] === "function",
  { message: "signer must be a NoteSigner" },
);

const errorHandlerSchema = z.custom<(error: unknown) => void>(
  (value) => typeof value === "function",
  { message: "onError must be a function" },
);

const antispamStoreSchema = z.custom<AntispamStore>(
  (value) =>
    isRecord(value) &&
    ["lookup", "followedSize", "record"].every((method) => typeof value[method] === "function"),
  { message: "antispam store must implement lookup, followedSize and record" },
);

const positiveInteger = z.number().int().positive();

export const DEFAULT_ANTISPAM_IN_MEMORY_ENTRIES = 256 << 10;
export const DEFAULT_ANTISPAM_PUSHBACK_THRESHOLD = 2048;

const logToConsole = (error: unknown): void => {
  console.error("tessellog background task failed", error);
};

export const AppenderOptionsSchema = z
  .object({
    driver: driverSchema,
    signer: signerSchema,
    additionalSigners: z.array(signerSchema).default([]),
    origin: z.string().regex(SINGLE_LINE_WITHOUT_CONTROL_CHARACTERS).optional(),
    checkpointInterval: positiveInteger.default(10_000),
    checkpointRepublishInterval: positiveInteger.default(600_000),
    batching: z
      .object({
        maxSize: positiveInteger.default(256),
        maxAge: z.number().int().nonnegative().default(250),
      })
      .default({}),
    pushback: z.object({ maxOutstanding: positiveInteger.default(4096) }).default({}),
    antispam: z
      .object({
        inMemoryEntries: positiveInteger.default(DEFAULT_ANTISPAM_IN_MEMORY_ENTRIES),
        store: antispamStoreSchema.optional(),
        pushbackThreshold: positiveInteger.default(DEFAULT_ANTISPAM_PUSHBACK_THRESHOLD),
      })
      .optional(),
    onError: errorHandlerSchema.default(() => logToConsole),
  })
  .superRefine((options, context) => {
    if (options.checkpointRepublishInterval < options.checkpointInterval) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpointRepublishInterval"],
        message: "republish interval must be at least the checkpoint interval",
      });
    }
    options.additionalSigners
      .filter(({ name }) => name !== options.signer.name)
      .forEach(({ name }) => {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["additionalSigners"],
          message: `additional signer ${name} must be named ${options.signer.name}`,
        });
      });
  });

export type AppenderOptions = z.input<typeof AppenderOptionsSchema>;

export type ResolvedAppenderOptions = z.output<typeof AppenderOptionsSchema>;

export const resolveAppenderOptions = (options: AppenderOptions): ResolvedAppenderOptions => {
  const parsed = AppenderOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      ({ path, message }) => `${path.join(".")}: ${message}`,
    );
    throw new Error(`invalid appender options: ${issues.join("; ")}`);
  }
  return parsed.data;
};
