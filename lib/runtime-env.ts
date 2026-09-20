export type D1StatementLike = { run(): Promise<unknown> };
export type D1BindingLike = {
  prepare(query: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown[]>;
};
export type R2ObjectLike = { body: ReadableStream };
export type R2BindingLike = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer, options?: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

export type ImmigrantSiteBindings = {
  DB: D1BindingLike;
  BUCKET: R2BindingLike;
};

export function getRuntimeBindings(): ImmigrantSiteBindings {
  const bindings = (globalThis as typeof globalThis & {
    __IMMIGRANT_SITE_BINDINGS__?: ImmigrantSiteBindings;
  }).__IMMIGRANT_SITE_BINDINGS__;
  if (!bindings?.DB || !bindings?.BUCKET) {
    throw new Error("Site storage bindings are unavailable.");
  }
  return bindings;
}
