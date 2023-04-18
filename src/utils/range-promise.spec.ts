import { rangePromise } from './range-promise';

describe('rangePromise', () => {
  const call = async <T>(v: T): Promise<T> => v;

  it('should work for one batch', async () => {
    await expect(rangePromise(call, 1, 2, 1)).resolves.toEqual([1]);
    await expect(rangePromise(call, 0, 3, 1)).resolves.toEqual([0, 1, 2]);
    await expect(rangePromise(call, -5, -3, 1)).resolves.toEqual([-5, -4]);
    await expect(rangePromise(call, -2, 1, 1)).resolves.toEqual([-2, -1, 0]);
  });

  it('should work for two batches', async () => {
    await expect(rangePromise(call, 0, 3, 2)).resolves.toEqual([0, 1, 2]);
    await expect(rangePromise(call, -3, -1, 2)).resolves.toEqual([-3, -2]);
  });

  it('should work for one value', async () => {
    await expect(rangePromise(call, 1, 1, 1)).resolves.toEqual([]);
    await expect(rangePromise(call, 3, 3, 1)).resolves.toEqual([]);
  });

  it('should work for one value and multiply batches', async () => {
    await expect(rangePromise(call, 1, 1, 5)).resolves.toEqual([]);
    await expect(rangePromise(call, 3, 3, 5)).resolves.toEqual([]);
  });

  it('should work if batch size is greater than step', async () => {
    await expect(rangePromise(call, 0, 1, 3)).resolves.toEqual([0]);
    await expect(rangePromise(call, 2, 5, 7)).resolves.toEqual([2, 3, 4]);
  });

  it('should work for equal batches', async () => {
    const result = [0, 1, 2, 3, 4];
    await expect(rangePromise(call, 0, 5, 1)).resolves.toEqual(result);
    await expect(rangePromise(call, 0, 5, 3)).resolves.toEqual(result);
    await expect(rangePromise(call, 0, 5, 5)).resolves.toEqual(result);
    await expect(rangePromise(call, 0, 5, 7)).resolves.toEqual(result);
  });

  it('should work for if last batch length = 1', async () => {
    await expect(rangePromise(call, 0, 6, 3)).resolves.toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it('should throw if from > to', async () => {
    await expect(() => rangePromise(call, 5, 1)).rejects.toThrowError();
    await expect(() => rangePromise(call, 5, 1, 2)).rejects.toThrowError();
  });

  it('should throw if batchSize <= 0', async () => {
    await expect(() => rangePromise(call, 1, 5, 0)).rejects.toThrowError();
    await expect(() => rangePromise(call, 1, 5, -1)).rejects.toThrowError();
  });
});
