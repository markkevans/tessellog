export interface AntispamStore {
  lookup(identity: Uint8Array): Promise<bigint | undefined>;
}
