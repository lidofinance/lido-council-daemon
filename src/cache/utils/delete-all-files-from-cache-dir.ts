import { unlink } from 'fs/promises';
import { CacheDirWithChainId } from '../types';
import * as gl from 'glob';
import { promisify } from 'util';

const glob = promisify(gl.glob);

export const deleteAllFilesFromCacheDir = async (
  cacheDir: CacheDirWithChainId,
): Promise<void> => {
  const absoluteFilePaths = await glob(`*`, {
    cwd: cacheDir,
    absolute: true,
  });

  try {
    await Promise.all(
      absoluteFilePaths.map(async (filePath) => unlink(filePath)),
    );
  } catch (error) {}
};
