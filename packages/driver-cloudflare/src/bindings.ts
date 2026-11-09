export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(key: string, value: Uint8Array): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first(): Promise<unknown>;
  run(): Promise<{ readonly meta: { readonly changes: number } }>;
  all(): Promise<{ readonly results: readonly unknown[] }>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<readonly unknown[]>;
}
