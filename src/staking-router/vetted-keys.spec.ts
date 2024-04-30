import { getVettedKeys, getVettedUnusedKeys } from './vetted-keys'; // Replace with your actual module path

describe('getVettedKeys', () => {
  test('should return an empty array for empty input arrays', () => {
    expect(getVettedKeys([], [])).toEqual([]);
  });

  test('should correctly filter and sort keys for multiple operators', () => {
    //  totalSigningKeys is used here only to describe cases,
    // we don't use is in algorithm in function to determine vetted keys
    const operators = [
      // 2 vetted unused keys, have some available limit
      { index: 1, stakingLimit: 3, usedSigningKeys: 1, totalSigningKeys: 4 },
      // 1 vetted unused key, have some available limit
      { index: 2, stakingLimit: 1, usedSigningKeys: 0, totalSigningKeys: 2 },
      // 0 vetted unused keys, staking limit wasnt increased
      { index: 3, stakingLimit: 0, usedSigningKeys: 0, totalSigningKeys: 1 },
      // 0 vetted unused keys, staking limit exceeded have one used key
      { index: 4, stakingLimit: 1, usedSigningKeys: 1, totalSigningKeys: 2 },
      // 0 vetted unused keys, have staking limit, but don't have keys to deposit
      { index: 5, stakingLimit: 1, usedSigningKeys: 0, totalSigningKeys: 0 },
    ] as any;

    const keys = [
      // operator 1 unused keys
      { operatorIndex: 1, index: 1 },
      { operatorIndex: 1, index: 0 },
      { operatorIndex: 1, index: 2 },
      { operatorIndex: 1, index: 3 },
      // operator 2 unused keys
      { operatorIndex: 2, index: 0 },
      { operatorIndex: 2, index: 1 },
      // operator 3 unused keys
      { operatorIndex: 3, index: 0 },
      // operator 4 unused keys
      { operatorIndex: 4, index: 1 },
      { operatorIndex: 4, index: 0 },
    ] as any;

    const expected = [
      { operatorIndex: 1, index: 0 },
      { operatorIndex: 1, index: 1 },
      { operatorIndex: 1, index: 2 },
      { operatorIndex: 2, index: 0 },
      { operatorIndex: 4, index: 0 },
    ];
    const result = getVettedKeys(operators, keys);
    expect(result.length).toEqual(expected.length);
    expect(result).toEqual(expected);
  });
});

test('', () => {
  const keys = [
    { operatorIndex: 1, index: 0, used: true },
    { operatorIndex: 1, index: 1, used: true },
    { operatorIndex: 1, index: 2, used: false },
    { operatorIndex: 2, index: 0, used: false },
    { operatorIndex: 4, index: 0, used: true },
  ] as any;

  const expected = [
    { operatorIndex: 1, index: 2, used: false },
    { operatorIndex: 2, index: 0, used: false },
  ] as any;

  expect(getVettedUnusedKeys(keys)).toEqual(expected);
});

// describe('getVettedUnusedKeys', () => {
//   test('should return an empty array for empty input arrays', () => {
//     expect(getVettedUnusedKeys([], [])).toEqual([]);
//   });

//   test('should correctly filter and sort keys for multiple operators', () => {
//     //  totalSigningKeys is used here only to describe cases,
//     // we don't use is in algorithm in function to determine vetted unused keys
//     const operators = [
//       // 2 vetted unused keys, have some available limit
//       { index: 1, stakingLimit: 3, usedSigningKeys: 1, totalSigningKeys: 4 },
//       // 1 vetted unused key, have some available limit
//       { index: 2, stakingLimit: 1, usedSigningKeys: 0, totalSigningKeys: 2 },
//       // 0 vetted unused keys, staking limit wasnt increased
//       { index: 3, stakingLimit: 0, usedSigningKeys: 0, totalSigningKeys: 1 },
//       // 0 vetted unused keys, staking limit exceeded have one used key
//       { index: 4, stakingLimit: 1, usedSigningKeys: 1, totalSigningKeys: 2 },
//       // 0 vetted unused keys, have staking limit, but don't have keys to deposit
//       { index: 5, stakingLimit: 1, usedSigningKeys: 0, totalSigningKeys: 0 },
//     ] as any;

//     const unusedKeys = [
//       // operator 1 unused keys
//       { operatorIndex: 1, index: 1 },
//       { operatorIndex: 1, index: 0 },
//       { operatorIndex: 1, index: 2 },
//       // operator 2 unused keys
//       { operatorIndex: 2, index: 0 },
//       { operatorIndex: 2, index: 1 },
//       // operator 3 unused keys
//       { operatorIndex: 3, index: 0 },
//       // operator 4 unused keys
//       { operatorIndex: 4, index: 0 },
//     ] as any;

//     const expected = [
//       { operatorIndex: 1, index: 0 },
//       { operatorIndex: 1, index: 1 },
//       { operatorIndex: 2, index: 0 },
//     ];
//     const result = getVettedUnusedKeys(operators, unusedKeys);
//     expect(result.length).toEqual(expected.length);
//     expect(getVettedUnusedKeys(operators, unusedKeys)).toEqual(expected);
//   });

//   test('should correctly sort keys within operators', () => {
//     const operators = [
//       { index: 1, stakingLimit: 4, usedSigningKeys: 1, totalSigningKeys: 5 },
//     ] as any;
//     const unusedKeys = [
//       { operatorIndex: 1, index: 3 },
//       { operatorIndex: 1, index: 1 },
//       { operatorIndex: 1, index: 2 },
//       { operatorIndex: 1, index: 4 },
//     ] as any;
//     const expected = [
//       { operatorIndex: 1, index: 1 },
//       { operatorIndex: 1, index: 2 },
//       { operatorIndex: 1, index: 3 },
//     ];
//     expect(getVettedUnusedKeys(operators, unusedKeys)).toEqual(expected);
//   });
// });
