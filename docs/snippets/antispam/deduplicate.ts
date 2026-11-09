import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openPosixAntispamStore, openPosixDriver } from "@tessellog/driver-posix";

export const deduplicatingAppender = async (signer: NoteSigner) => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const appender = createAppender({
    driver,
    signer,
    antispam: {
      inMemoryEntries: 256 * 1024,
      store: await openPosixAntispamStore({ root: "./my-log-antispam" }),
    },
  });

  const entry = new TextEncoder().encode("the same thing twice");
  const first = await appender.add(entry);
  const second = await appender.add(entry);
  console.log(first.index === second.index, second.isDup);
  return appender;
};
