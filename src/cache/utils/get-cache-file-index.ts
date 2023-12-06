import * as path from 'path';

/**
 * Returns cache file index
 *
 * Examples:
 *
 * /home/test/0.cacheFilePostfix.json -> 0
 * /home/test/42.cacheFilePostfix.json -> 42
 * /home/test/cacheFilePostfix.json -> NaN
 */
export const getCacheFileNameIndex = (filePath: string): number => {
  const mask = RegExp('^[0-9]+');

  const filename = path.basename(filePath);

  if (!mask.test(filename)) {
    return NaN;
  }

  return parseInt(filename, 10);
};
