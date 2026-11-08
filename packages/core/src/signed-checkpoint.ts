import { parseCheckpoint, type Checkpoint } from "./checkpoint.js";
import type { NoteVerifier } from "./note-keys.js";
import { keyLabel, openNote, type OpenedNote } from "./open-note.js";
import { failure, success, type Result } from "./result.js";

export type OpenedCheckpoint = {
  readonly checkpoint: Checkpoint;
  readonly note: OpenedNote;
};

export const openCheckpoint = async ({
  message,
  origin,
  logVerifier,
  otherVerifiers = [],
}: {
  readonly message: Uint8Array;
  readonly origin: string;
  readonly logVerifier: NoteVerifier;
  readonly otherVerifiers?: readonly NoteVerifier[];
}): Promise<Result<OpenedCheckpoint>> => {
  const note = await openNote({ message, verifiers: [logVerifier, ...otherVerifiers] });
  if (!note.ok) {
    return note;
  }
  const signedByLog = note.value.verifiedSignatures.some(
    ({ name, keyId }) => name === logVerifier.name && keyId === logVerifier.keyId,
  );
  if (!signedByLog) {
    return failure(`checkpoint is not signed by log key ${keyLabel(logVerifier)}`);
  }
  const checkpoint = parseCheckpoint(note.value.text);
  if (!checkpoint.ok) {
    return checkpoint;
  }
  if (checkpoint.value.origin !== origin) {
    return failure(
      `checkpoint origin ${checkpoint.value.origin} does not match ${origin}`,
    );
  }
  return success({ checkpoint: checkpoint.value, note: note.value });
};
