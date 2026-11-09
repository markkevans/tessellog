import { createAppender } from "@tessellog/appender";
import { parseSignerKey, type NoteSigner } from "@tessellog/core";
import { openCloudflareDriver, type D1DatabaseLike, type R2BucketLike } from "@tessellog/driver-cloudflare";
import { createLogHandler, type LogHandler } from "@tessellog/http";

const CHECKPOINT_INTERVAL_MS = 1_000;
const LOG_NAME = "log";

export interface LogStub {
  fetch(request: Request): Promise<Response>;
}

export interface LogNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): LogStub;
}

export type Env = {
  readonly LOG: LogNamespace;
  readonly LOG_BUCKET: R2BucketLike;
  readonly LOG_DB: D1DatabaseLike;
  readonly LOG_PRIVATE_KEY: string;
};

type OpenLog = {
  readonly handler: LogHandler;
  readonly close: () => Promise<void>;
};

const text = (status: number, body: string): Response =>
  new Response(`${body}\n`, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

const openLog = async (env: Env, signer: NoteSigner): Promise<OpenLog> => {
  const driver = await openCloudflareDriver({ bucket: env.LOG_BUCKET, db: env.LOG_DB });
  const appender = createAppender({ driver, signer, checkpointInterval: CHECKPOINT_INTERVAL_MS });
  return {
    handler: createLogHandler({ appender }),
    close: async () => {
      await appender.shutdown();
      await driver.close();
    },
  };
};

export class LogDurableObject implements LogStub {
  private opening: Promise<OpenLog> | undefined;

  constructor(
    _state: unknown,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const signer = parseSignerKey(this.env.LOG_PRIVATE_KEY);
    if (!signer.ok) {
      return text(500, `the log is not configured: ${signer.error}`);
    }
    const opening = this.opening ?? openLog(this.env, signer.value);
    this.opening = opening;
    try {
      const { handler } = await opening;
      return await handler(request);
    } catch (error) {
      this.opening = undefined;
      console.error(error);
      return text(503, "the log is not available, try again");
    }
  }

  async close(): Promise<void> {
    const opening = this.opening;
    this.opening = undefined;
    await Promise.all([opening].filter((open) => open !== undefined).map(async (open) => (await open).close()));
  }
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> => env.LOG.get(env.LOG.idFromName(LOG_NAME)).fetch(request),
};
