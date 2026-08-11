export type ImmigrantSiteBindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
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
