import {
  packNodeOperatorIds,
  packVettedSigningKeysCounts,
  padAndJoinHex,
  padHex,
} from './bytes';

describe('padHex', () => {
  test('converts number to hex with specified bytes', () => {
    expect(padHex(123, 8)).toBe('0x000000000000007b');
    expect(padHex(456, 8)).toBe('0x00000000000001c8');
    expect(padHex(789, 8)).toBe('0x0000000000000315');
  });
});

describe('padAndJoinHex', () => {
  test('converts list of numbers to joined hex string', () => {
    expect(padAndJoinHex([123, 456, 789], 8)).toBe(
      '0x000000000000007b00000000000001c80000000000000315',
    );
  });
});

describe('packNodeOperatorIds', () => {
  test('packs node operator IDs into hexadecimal string', () => {
    const nodeOperatorIds = [123, 456, 789];
    expect(packNodeOperatorIds(nodeOperatorIds)).toBe(
      '0x000000000000007b00000000000001c80000000000000315',
    );
  });
});

describe('packVettedSigningKeysCounts', () => {
  test('packs node operator IDs into hexadecimal string', () => {
    const vettedSigningKeysCounts = [123, 456, 789];
    expect(packVettedSigningKeysCounts(vettedSigningKeysCounts)).toBe(
      '0x0000000000000000000000000000007b000000000000000000000000000001c800000000000000000000000000000315',
    );
  });
});
