import type { LogClient } from "@tessellog/client";

export const printEntries = async (client: LogClient, from: bigint) => {
  const latest = await client.latestCheckpoint();
  if (!latest.ok) throw new Error(latest.error);

  for await (const streamed of client.entries({ checkpoint: latest.value.checkpoint, from })) {
    if (!streamed.ok) throw new Error(streamed.error);
    console.log(streamed.value.index, new TextDecoder().decode(streamed.value.entry));
  }
};
