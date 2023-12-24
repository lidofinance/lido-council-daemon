import { getVettedUnusedKeys } from './vetted-keys'; // Replace with your actual module path

describe('getVettedUnusedKeys', () => {
  test('should return an empty array for empty input arrays', () => {
    expect(getVettedUnusedKeys([], [])).toEqual([]);
  });

  test('should return an empty array when there are operators but no unused keys', () => {
    const operators = [
      { index: 1, stakingLimit: 1, usedSigningKeys: 0 },
    ] as any;
    expect(getVettedUnusedKeys(operators, [])).toEqual([]);
  });

  test('should return an empty array when there are unused keys but no operators', () => {
    const unusedKeys = [{ operatorIndex: 1, index: 1 }] as any;
    expect(getVettedUnusedKeys([], unusedKeys)).toEqual([]);
  });

  test('should correctly filter and sort keys for multiple operators', () => {
    const operators = [
      { index: 1, stakingLimit: 2, usedSigningKeys: 1 },
      { index: 2, stakingLimit: 1, usedSigningKeys: 0 },
    ] as any;
    const unusedKeys = [
      { operatorIndex: 1, index: 2 },
      { operatorIndex: 1, index: 1 },
      { operatorIndex: 2, index: 3 },
    ] as any;
    const expected = [
      { operatorIndex: 1, index: 1 },
      { operatorIndex: 2, index: 3 },
    ];
    expect(getVettedUnusedKeys(operators, unusedKeys)).toEqual(expected);
  });

  test('should handle operators that have exceeded their staking limits', () => {
    const operators = [
      { index: 1, stakingLimit: 1, usedSigningKeys: 2 },
    ] as any;
    const unusedKeys = [{ operatorIndex: 1, index: 1 }] as any;
    expect(getVettedUnusedKeys(operators, unusedKeys)).toEqual([]);
  });

  test('should handle operators with no remaining staking limits', () => {
    const operators = [
      { index: 1, stakingLimit: 1, usedSigningKeys: 1 },
    ] as any;
    const unusedKeys = [{ operatorIndex: 1, index: 1 }] as any;
    expect(getVettedUnusedKeys(operators, unusedKeys)).toEqual([]);
  });

  test('should correctly sort keys within operators', () => {
    const operators = [
      { index: 1, stakingLimit: 3, usedSigningKeys: 0 },
    ] as any;
    const unusedKeys = [
      { operatorIndex: 1, index: 3 },
      { operatorIndex: 1, index: 1 },
      { operatorIndex: 1, index: 2 },
    ] as any;
    const expected = [
      { operatorIndex: 1, index: 1 },
      { operatorIndex: 1, index: 2 },
      { operatorIndex: 1, index: 3 },
    ];
    expect(getVettedUnusedKeys(operators, unusedKeys)).toEqual(expected);
  });
});
