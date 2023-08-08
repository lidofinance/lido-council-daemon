import { validateCacheFilePathsOrFail } from './validate-cache-file-paths-or-fail';

describe('validateCacheFilePaths', () => {
  it('should be OK on empty array', async () => {
    expect(() => validateCacheFilePathsOrFail([])).not.toThrowError();
  });

  it('should be OK on 00.{file} file-path', async () => {
    expect(() =>
      validateCacheFilePathsOrFail(['00.file.json']),
    ).not.toThrowError();
  });

  it('should throw error on 01.{file} file-path', async () => {
    expect(() => validateCacheFilePathsOrFail(['01.file.json'])).toThrowError();
  });

  it('should be OK on consecutive file-paths', async () => {
    expect(() =>
      validateCacheFilePathsOrFail([
        '00.file.json',
        '01.file.json',
        '02.file.json',
        '03.file.json',
      ]),
    ).not.toThrowError();
  });

  it('should throw error on non-consecutive file-paths', async () => {
    expect(() =>
      validateCacheFilePathsOrFail([
        '00.file.json',
        '01.file.json',
        '02.file.json',
        '04.file.json',
      ]),
    ).toThrowError();
  });
});
