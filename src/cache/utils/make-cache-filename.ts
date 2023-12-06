export const makeCacheFileName = (
  batchIndex: number,
  cacheFilePostfix: string,
): string => {
  return `${batchIndex}.${cacheFilePostfix}`;
};
