import * as path from 'path';

export const getCacheFileNameBatchIndex = (filePath: string): number => {
  const mask = RegExp('^[0-9]*');

  const filename = path.basename(filePath);

  if (!mask.test(filename)) {
    return NaN;
  }

  return parseInt(filename, 10);
};
