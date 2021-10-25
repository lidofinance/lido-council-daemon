import { range } from './range';

describe('range', () => {
  it('should return an empty array if from equals to', () => {
    expect(range(0, 0)).toEqual([]);
    expect(range(1, 1)).toEqual([]);
  });

  it('should return interval of numbers [from, to)', () => {
    expect(range(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it('should work with negative numbers', () => {
    expect(range(-3, 2)).toEqual([-3, -2, -1, 0, 1]);
    expect(range(-3, -1)).toEqual([-3, -2]);
    expect(range(-3, -2)).toEqual([-3]);
  });

  it('should work in the opposite direction', () => {
    expect(range(4, 0)).toEqual([4, 3, 2, 1]);
    expect(range(2, -2)).toEqual([2, 1, 0, -1]);
  });
});
