import { range } from './range';

export const rangePromise = async <T>(
  callback: (step: number) => Promise<T>,
  from: number,
  to: number,
  batchSize = 20,
): Promise<T[]> => {
  if (to < from) throw new Error('From should be less than to');
  if (batchSize <= 0) throw new Error('batchSize should be greater than 0');

  const batchFrom = 0;
  const batchTo = Math.ceil((to - from) / batchSize);
  let result: T[] = [];

  for (let batch = batchFrom; batch < batchTo; batch++) {
    const batchSlotFrom = from + batch * batchSize;
    const batchSlotTo = Math.min(batchSlotFrom + batchSize, to);

    const batchResult = await Promise.all(
      range(batchSlotFrom, batchSlotTo).map((step) => callback(step)),
    );

    result = result.concat(batchResult);
  }

  return result;
};
