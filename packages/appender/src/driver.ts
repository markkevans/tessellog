export interface LogDriver {
  sequence(entries: readonly Uint8Array[]): Promise<bigint>;
}
