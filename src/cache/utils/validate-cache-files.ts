import { CacheError } from '../errors';
import { CacheFile } from '../types';

export const validateCacheFilesAreConsecutiveOrFail = (
  cacheFiles: CacheFile[],
) => {
  for (let i = 0; i < cacheFiles.length; i++) {
    if (cacheFiles[i].index !== i) {
      throw new CacheError(`Non consecutive cache file`);
    }
  }
};
