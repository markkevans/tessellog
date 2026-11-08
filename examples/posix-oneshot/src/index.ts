import { readFile } from "node:fs/promises";
import { createAppender } from "@tessellog/appender";
import { parseSignerKey, type NoteSigner } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

export type OneshotOptions = {
  readonly storageDir: string;
  readonly privateKeyFile: string;
  readonly files: readonly string[];
};

export type AddedFile = {
  readonly file: string;
  readonly index: bigint;
};

const readSigner = async (privateKeyFile: string): Promise<NoteSigner> => {
  const parsed = parseSignerKey((await readFile(privateKeyFile, "utf8")).trim());
  if (!parsed.ok) {
    throw new Error(`invalid private key in ${privateKeyFile}: ${parsed.error}`);
  }
  return parsed.value;
};

export const oneshot = async ({
  storageDir,
  privateKeyFile,
  files,
}: OneshotOptions): Promise<readonly AddedFile[]> => {
  const signer = await readSigner(privateKeyFile);
  const inputs = await Promise.all(
    files.map(async (file) => ({ file, content: new Uint8Array(await readFile(file)) })),
  );
  const driver = await openPosixDriver({ root: storageDir });
  try {
    const appender = createAppender({ driver, signer });
    const added = await Promise.all(
      inputs.map(async ({ file, content }) => ({ file, index: (await appender.add(content)).index })),
    );
    await appender.shutdown();
    return added;
  } finally {
    await driver.close();
  }
};
