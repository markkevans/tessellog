import { createAppender } from "@tessellog/appender";
import { createRFC6962Signer } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { encodeCtSubmission, staticCtEntriesPath, staticCtLayout, type CtEntry } from "@tessellog/static-ct";

export const openCtLog = async (p256PrivateKey: Uint8Array) => {
  const signer = createRFC6962Signer({ name: "ct.example.com/2026h1", privateKey: p256PrivateKey });
  if (!signer.ok) throw new Error(signer.error);

  const driver = await openPosixDriver({ root: "./ct-log", entriesPath: staticCtEntriesPath });
  const appender = createAppender({ driver, signer: signer.value, layout: staticCtLayout });

  const submit = (entry: CtEntry) => appender.add(encodeCtSubmission(entry));
  return { appender, submit };
};
