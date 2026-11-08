import type { Checkpoint } from "@tessellog/core";
import type { LogClient } from "../../src/index.js";

export const latestCheckpointOf = async (client: LogClient): Promise<Checkpoint> => {
  const opened = await client.latestCheckpoint();
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.value.checkpoint;
};
