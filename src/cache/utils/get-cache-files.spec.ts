import { getCacheFiles } from './get-cache-files';

describe('getCacheFiles', () => {
  it('should return empty array on empty array', async () => {
    const cacheFiles = getCacheFiles([]);
    expect(cacheFiles).toBeInstanceOf(Array);
    expect(cacheFiles.length).toBe(0);
  });

  it('should work for one file `/00.file.json`', async () => {
    const filePaths = ['/00.file.json'];
    const cacheFiles = getCacheFiles(filePaths);
    expect(cacheFiles).toBeInstanceOf(Array);
    expect(cacheFiles.length).toBe(1);
    expect(cacheFiles).toEqual([
      { index: 0, absoluteFilePath: '/00.file.json' },
    ]);
  });

  it('should throw error on `/01.file.json` because its not consecutive (starts with 0)', async () => {
    const filePaths = ['/01.file.json'];
    expect(() => getCacheFiles(filePaths)).toThrowError();
  });

  it('should be OK on consecutive file-paths', async () => {
    const filePaths = ['/00.file.json', '/01.file.json', '/02.file.json'];
    const cacheFiles = getCacheFiles(filePaths);
    expect(cacheFiles).toBeInstanceOf(Array);
    expect(cacheFiles.length).toBe(3);
    expect(cacheFiles).toEqual([
      { index: 0, absoluteFilePath: '/00.file.json' },
      { index: 1, absoluteFilePath: '/01.file.json' },
      { index: 2, absoluteFilePath: '/02.file.json' },
    ]);
  });

  it('should sort consecutive file-paths', async () => {
    const filePaths = ['/02.file.json', '/00.file.json', '/01.file.json'];
    const cacheFiles = getCacheFiles(filePaths);
    expect(cacheFiles).toBeInstanceOf(Array);
    expect(cacheFiles.length).toBe(3);
    expect(cacheFiles).toEqual([
      { index: 0, absoluteFilePath: '/00.file.json' },
      { index: 1, absoluteFilePath: '/01.file.json' },
      { index: 2, absoluteFilePath: '/02.file.json' },
    ]);
  });

  it('should throw error on non-consecutive file-paths', async () => {
    const filePaths = ['/00.file.json', '/01.file.json', '/03.file.json'];
    expect(() => getCacheFiles(filePaths)).toThrowError();
  });

  it('should skip not indexed file-paths', async () => {
    const filePaths = [
      '/00.file.json',
      '/file.json',
      '/01.file.json',
      '/02.file.json',
    ];
    const cacheFiles = getCacheFiles(filePaths);
    expect(cacheFiles).toBeInstanceOf(Array);
    expect(cacheFiles.length).toBe(3);
    expect(cacheFiles).toEqual([
      { index: 0, absoluteFilePath: '/00.file.json' },
      { index: 1, absoluteFilePath: '/01.file.json' },
      { index: 2, absoluteFilePath: '/02.file.json' },
    ]);
  });
});
