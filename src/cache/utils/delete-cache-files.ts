import { unlink } from 'fs/promises';

export const deleteAllCacheFiles = async (
  filePaths: string[],
): Promise<void> => {
  try {
    await Promise.all(filePaths.map(async (filePath) => unlink(filePath)));
  } catch (error) {}
};
