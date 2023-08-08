import { join } from 'path';
import { promisify } from 'util';
import * as gl from 'glob';
import { getCacheFileNameBatchIndex } from './cache-filepath';
import { CacheDirWithChainId } from '../types';

const glob = promisify(gl.glob);

export const getCacheFilePaths = async (
  cacheDir: CacheDirWithChainId,
  cacheFileName: string,
): Promise<string[]> => {
  const result = await glob(`*([0-9]).${cacheFileName}`, { cwd: cacheDir });

  return result
    .sort(
      (a, b) => getCacheFileNameBatchIndex(a) - getCacheFileNameBatchIndex(b),
    )
    .map((filePath) => join(cacheDir, filePath));
};
