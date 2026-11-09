import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { parseSignerKey, type NoteSigner } from "@tessellog/core";

const signerFrom = (key: string | undefined): NoteSigner => {
  const parsed = parseSignerKey(key ?? "");
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
};

const appender = createAppender({
  driver: createMemoryDriver(),
  signer: signerFrom(process.env["LOG_PRIVATE_KEY"]),
  additionalSigners: [signerFrom(process.env["LOG_NEXT_PRIVATE_KEY"])],
});
await appender.shutdown();
