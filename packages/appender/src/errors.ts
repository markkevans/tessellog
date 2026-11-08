export class PushbackError extends Error {
  override readonly name = "PushbackError";

  constructor() {
    super("too many entries awaiting integration");
  }
}
