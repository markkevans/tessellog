import { encodeBase64, openNote, type NoteVerifier, type Result } from "@tessellog/core";

const CONFLICT = 409;

export type CheckpointSubmission = {
  readonly checkpoint: string;
  readonly size: bigint;
  readonly proof: (oldSize: bigint) => Promise<readonly Uint8Array[]>;
};

export type WitnessClient = {
  readonly addCheckpoint: (submission: CheckpointSubmission) => Promise<Result<string>>;
};

type Attempt =
  | { readonly kind: "cosigned"; readonly lines: string }
  | { readonly kind: "conflict"; readonly size: bigint }
  | { readonly kind: "failed"; readonly error: string };

const withTrailingSlash = (url: string): string => (url.endsWith("/") ? url : `${url}/`);

const noteText = (checkpoint: string): string => `${checkpoint.split("\n\n")[0]}\n`;

const requestBody = async (oldSize: bigint, submission: CheckpointSubmission): Promise<string> => {
  const proof = oldSize === 0n ? [] : await submission.proof(oldSize);
  return `old ${oldSize}\n${proof.map((hash) => `${encodeBase64(hash)}\n`).join("")}\n${submission.checkpoint}`;
};

const verifiedLines = async (
  verifier: NoteVerifier,
  checkpoint: string,
  lines: string,
): Promise<string | undefined> => {
  const opened = await openNote({
    message: new TextEncoder().encode(`${noteText(checkpoint)}\n${lines}`),
    verifiers: [verifier],
  });
  return opened.ok
    ? opened.value.verifiedSignatures.map(({ name, base64 }) => `— ${name} ${base64}\n`).join("")
    : undefined;
};

export const createWitnessClient = ({
  url,
  verifier,
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
}: {
  readonly url: string;
  readonly verifier: NoteVerifier;
  readonly fetch?: typeof fetch;
}): WitnessClient => {
  const endpoint = new URL("add-checkpoint", withTrailingSlash(url)).toString();
  const name = verifier.name;
  let knownSize = 0n;

  const attempt = async (oldSize: bigint, submission: CheckpointSubmission): Promise<Attempt> => {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      body: await requestBody(oldSize, submission),
    }).catch((error: Error) => error);
    if (response instanceof Error) {
      return { kind: "failed", error: `witness ${name} is unreachable: ${response.message}` };
    }
    const body = await response.text();
    if (response.status === CONFLICT) {
      return { kind: "conflict", size: BigInt(body.trim()) };
    }
    return response.ok
      ? { kind: "cosigned", lines: body }
      : { kind: "failed", error: `witness ${name} refused the checkpoint with status ${response.status}: ${body}` };
  };

  const resolve = async (result: Attempt, submission: CheckpointSubmission): Promise<Result<string>> => {
    if (result.kind === "failed") {
      return { ok: false, error: result.error };
    }
    if (result.kind === "conflict") {
      return { ok: false, error: `witness ${name} kept reporting a different size` };
    }
    const lines = await verifiedLines(verifier, submission.checkpoint, result.lines);
    if (lines === undefined) {
      return { ok: false, error: `witness ${name} returned no valid cosignature` };
    }
    knownSize = submission.size;
    return { ok: true, value: lines };
  };

  return {
    addCheckpoint: async (submission) => {
      const first = await attempt(knownSize, submission);
      if (first.kind !== "conflict") {
        return resolve(first, submission);
      }
      if (first.size > submission.size) {
        return {
          ok: false,
          error: `witness ${name} has cosigned a larger tree (${first.size}) than this checkpoint (${submission.size})`,
        };
      }
      knownSize = first.size;
      return resolve(await attempt(first.size, submission), submission);
    },
  };
};
