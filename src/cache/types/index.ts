import * as z from 'zod';

export const JsonLiteral = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type JsonLiteral = z.infer<typeof JsonLiteral>;

export const JsonRecord = z.lazy(() => z.record(Json));
export type JsonRecord = {
  [key: string]: Json;
};

export const JsonArray = z.lazy(() => z.array(Json));
export type JsonArray = Array<Json>;

export const Json: z.ZodType<Json> = z.lazy(() =>
  z.union([JsonLiteral, JsonArray, JsonRecord]),
);
export type Json = JsonLiteral | JsonRecord | JsonArray;

export const Versionable = z.object({
  version: z.string(), // represents version of the cache
});
export type Versionable = z.infer<typeof Versionable>;

export const Stats = z.object({
  dataTotalLength: z.number().min(0), // represents total size of the cache
});
export type Stats = z.TypeOf<typeof Stats>;

export const CacheStats = z.object({
  stats: Stats,
});
export type CacheStats = z.TypeOf<typeof CacheStats>;

export const CacheHeaders = z.intersection(JsonRecord, Versionable);
export type CacheHeaders = z.infer<typeof CacheHeaders>;

export const CacheData = JsonRecord;
export type CacheData = z.infer<typeof CacheData>;

export const CacheContent = z.object({
  headers: CacheHeaders,
  data: CacheData,
});
export type CacheContent = z.infer<typeof CacheContent>;

export const CacheFileContent = CacheContent.merge(CacheStats);
export type CacheFileContent = z.infer<typeof CacheFileContent>;

const CacheDirChainIdBrand = Symbol('cacheDirChainIdBrand');

/**
 * Special Branded type for cache directory with chain id in it
 */
export type CacheDirWithChainId = string & {
  readonly [CacheDirChainIdBrand]: unique symbol;
};
