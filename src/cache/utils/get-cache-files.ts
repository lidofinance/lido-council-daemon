import { CacheFile } from '../types';
import { getCacheFileNameIndex } from './get-cache-file-index';
import { validateCacheFilesAreConsecutiveOrFail } from './validate-cache-files';

/**
 * Gets correct sorted array of CacheFiles
 */
export const getCacheFiles = (filePaths: string[]): CacheFile[] => {
  const cacheFiles = filePaths
    .map((filePath) => ({
      absoluteFilePath: filePath,
      index: getCacheFileNameIndex(filePath),
    }))
    .filter((x) => x.index >= 0);

  validateCacheFilesAreConsecutiveOrFail(cacheFiles);

  return cacheFiles;
};
