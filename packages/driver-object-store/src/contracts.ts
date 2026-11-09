import type { TreeState } from "@tessellog/appender";

export interface ObjectStore {
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, data: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Coordinator {
  sequence(entries: readonly Uint8Array[]): Promise<bigint>;
  readSequenced(fromIndex: bigint): Promise<readonly Uint8Array[]>;
  readTreeState(): Promise<TreeState>;
  advanceTreeState(expectedSize: bigint, next: TreeState): Promise<boolean>;
}

export interface Lease {
  renew(): Promise<void>;
  release(): Promise<void>;
}
