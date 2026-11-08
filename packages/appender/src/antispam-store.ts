export type FollowedEntry = {
  readonly identity: Uint8Array;
  readonly index: bigint;
};

export interface AntispamStore {
  lookup(identity: Uint8Array): Promise<bigint | undefined>;
  followedSize(): Promise<bigint>;
  record(entries: readonly FollowedEntry[], followedSize: bigint): Promise<void>;
}
