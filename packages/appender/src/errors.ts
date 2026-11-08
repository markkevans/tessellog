export class PushbackError extends Error {
  override readonly name: string = "PushbackError";

  constructor(message = "too many entries awaiting integration") {
    super(message);
  }
}

export class PushbackAntispamError extends PushbackError {
  override readonly name: string = "PushbackAntispamError";

  constructor() {
    super("antispam follower is too far behind");
  }
}
