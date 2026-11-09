import { readFile } from "node:fs/promises";
import { createAppender } from "@tessellog/appender";
import { parseSignerKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

const signer = parseSignerKey((await readFile("log.key", "utf8")).trim());
if (!signer.ok) throw new Error(signer.error);

const driver = await openPosixDriver({ root: "./my-log" });
const appender = createAppender({ driver, signer: signer.value });

const added = await Promise.all(
  ["first", "second", "third"].map((text) => appender.add(new TextEncoder().encode(text))),
);
console.log(added.map(({ index }) => index));

await appender.shutdown();
await driver.close();
