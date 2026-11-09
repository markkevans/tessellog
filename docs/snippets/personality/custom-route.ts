import { EntryTooLargeError, PushbackError, type Appender } from "@tessellog/appender";

export const addRelease = async (appender: Appender, manifest: unknown): Promise<Response> => {
  if (typeof manifest !== "object" || manifest === null || !("artifact" in manifest)) {
    return new Response("a release manifest needs an artifact\n", { status: 400 });
  }
  try {
    const { index, isDup } = await appender.add(new TextEncoder().encode(JSON.stringify(manifest)));
    const checkpoint = await appender.awaitPublication(index);
    return Response.json({ index: index.toString(), isDup, checkpoint: new TextDecoder().decode(checkpoint) });
  } catch (error) {
    if (error instanceof PushbackError) {
      return new Response("busy, retry shortly\n", { status: 503, headers: { "retry-after": "1" } });
    }
    if (error instanceof EntryTooLargeError) {
      return new Response(`${error.message}\n`, { status: 413 });
    }
    throw error;
  }
};
