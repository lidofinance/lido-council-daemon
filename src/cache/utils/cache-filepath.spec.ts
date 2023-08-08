import { getCacheFileNameBatchIndex } from './cache-filepath';

describe('getCacheFileNameBatchIndex', () => {
  it('should result NaN on empty filepath', async () => {
    const index = getCacheFileNameBatchIndex('');
    expect(index).toBeNaN();
  });

  it('should result NaN on filepath without digits', async () => {
    const index = getCacheFileNameBatchIndex('file.json');
    expect(index).toBeNaN();
  });

  it('should result NaN on filepath without digits at the biginning', async () => {
    const index = getCacheFileNameBatchIndex('file001.json');
    expect(index).toBeNaN();
  });

  it('should result 0 on empty 0x1.cache.json', async () => {
    const index = getCacheFileNameBatchIndex('0x1.cache.json');
    expect(index).toEqual(0);
  });

  it('should result 0 on empty 0.cache.json', async () => {
    const index = getCacheFileNameBatchIndex('0.cache.json');
    expect(index).toEqual(0);
  });

  it('should result 42 on empty 042.cache.json', async () => {
    const index = getCacheFileNameBatchIndex('042.cache.json');
    expect(index).toEqual(42);
  });
});
