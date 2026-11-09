import { readFile } from "node:fs/promises";
import { createAppender } from "@tessellog/appender";
import { parsePolicy, parseSignerKey, type NoteSigner, type Policy } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

export type OneshotOptions = {
  readonly storageDir: string;
  readonly privateKeyFile: string;
  readonly files: readonly string[];
  readonly witnessPolicyFile?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
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

const readPolicy = async (policyFile: string): Promise<Policy> => {
  const parsed = parsePolicy(await readFile(policyFile, "utf8"));
  if (!parsed.ok) {
    throw new Error(`invalid witness policy in ${policyFile}: ${parsed.error}`);
  }
  return parsed.value;
};

export const oneshot = async ({
  storageDir,
  privateKeyFile,
  files,
  witnessPolicyFile,
  fetch: fetchImpl,
}: OneshotOptions): Promise<readonly AddedFile[]> => {
  const signer = await readSigner(privateKeyFile);
  const witnessing =
    witnessPolicyFile === undefined
      ? {}
      : { witnessing: { policy: await readPolicy(witnessPolicyFile), fetch: fetchImpl } };
  const inputs = await Promise.all(
    files.map(async (file) => ({ file, content: new Uint8Array(await readFile(file)) })),
  );
  const driver = await openPosixDriver({ root: storageDir });
  try {
    const appender = createAppender({ driver, signer, ...witnessing });
    const added = await Promise.all(
      inputs.map(async ({ file, content }) => ({ file, index: (await appender.add(content)).index })),
    );
    await appender.shutdown();
    return added;
  } finally {
    await driver.close();
  }
};
