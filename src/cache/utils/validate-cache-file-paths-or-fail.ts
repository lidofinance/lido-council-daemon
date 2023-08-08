import { getCacheFileNameBatchIndex } from './cache-filepath';
import { CacheError } from '../errors';

export const validateCacheFilePathsOrFail = (filePaths: string[]) => {
  const fileBatchIndexes = filePaths.map(getCacheFileNameBatchIndex);

  for (let i = 0; i < filePaths.length; i++) {
    if (fileBatchIndexes[i] !== i) {
      throw new CacheError('Non consecutive cache file paths');
    }
  }
};
