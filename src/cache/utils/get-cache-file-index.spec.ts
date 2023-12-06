import { getCacheFileNameIndex } from './get-cache-file-index';

describe('getCacheFileNameBatchIndex', () => {
  it('should result NaN on empty filepath', async () => {
    const index = getCacheFileNameIndex('');
    expect(index).toBeNaN();
  });

  it('should result NaN on `/` filepath', async () => {
    const index = getCacheFileNameIndex('/');
    expect(index).toBeNaN();
  });

  it('should result NaN on filepath without digits', async () => {
    const index = getCacheFileNameIndex('/home/test/file.json');
    expect(index).toBeNaN();
  });

  it('should result NaN on filepath without digits at the beginning', async () => {
    const index = getCacheFileNameIndex('/home/test/file001.json');
    expect(index).toBeNaN();
  });

  it('should result 0 on `0x1.cache.json`', async () => {
    const index = getCacheFileNameIndex('/home/test/0x1.cache.json');
    expect(index).toEqual(0);
  });

  it('should result 0 on `0.cache.json`', async () => {
    const index = getCacheFileNameIndex('/home/test/0.cache.json');
    expect(index).toEqual(0);
  });

  it('should result 42 on `042.cache.json`', async () => {
    const index = getCacheFileNameIndex('/home/test/042.cache.json');
    expect(index).toEqual(42);
  });

  it('should result 4 on `4 3..cache.json`', async () => {
    const index = getCacheFileNameIndex('/home/test/4 3.cache.json');
    expect(index).toEqual(4);
  });
});
