import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseVerifierKey, type Checkpoint } from "@tessellog/core";

const verifier = parseVerifierKey("example.com/my-log+afda4ace+AcOem5yfbPSq9fNpNGwfDJ+fU8XvGDaJweXRm65tp4RB");
if (!verifier.ok) throw new Error(verifier.error);

const client = createLogClient({
  fetcher: createHttpFetcher({ baseUrl: "https://log.example.com/" }),
  origin: "example.com/my-log",
  logVerifier: verifier.value,
});

export const checkEntry = async (entry: Uint8Array, index: bigint, previous?: Checkpoint) => {
  const latest = await client.latestCheckpoint();
  if (!latest.ok) return latest;
  const { checkpoint } = latest.value;

  if (previous !== undefined) {
    const consistent = await client.checkConsistency(previous, checkpoint);
    if (!consistent.ok) return consistent;
  }
  return client.proveInclusion({ entry, index, checkpoint });
};
