import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseRFC6962VerifierKey } from "@tessellog/core";
import { decodeTileLeaves, staticCtLayout } from "@tessellog/static-ct";

export const certificatesIn = async (baseUrl: string, verifierKey: string) => {
  const logVerifier = parseRFC6962VerifierKey(verifierKey);
  if (!logVerifier.ok) throw new Error(logVerifier.error);

  const client = createLogClient({
    fetcher: createHttpFetcher({ baseUrl, layout: staticCtLayout }),
    origin: logVerifier.value.name,
    logVerifier: logVerifier.value,
    layout: staticCtLayout,
  });
  const latest = await client.latestCheckpoint();
  if (!latest.ok) throw new Error(latest.error);

  for await (const streamed of client.entries({ checkpoint: latest.value.checkpoint })) {
    if (!streamed.ok) throw new Error(streamed.error);
    const decoded = decodeTileLeaves(streamed.value.entry);
    if (decoded.ok) console.log(streamed.value.index, decoded.value[0]?.entry.isPrecert);
  }
};
