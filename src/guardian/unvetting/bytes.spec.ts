import {
  decimalToHexBytes,
  hexBytesToDecimal,
  packNodeOperatorIds,
  packVettedSigningKeysCounts,
  unpackNodeOperatorIds,
} from './bytes';

describe('decimalToHexBytes', () => {
  test('converts decimal number to hexadecimal string with specified bytes', () => {
    expect(decimalToHexBytes(123, 8)).toBe('000000000000007b');
    expect(decimalToHexBytes(456, 8)).toBe('00000000000001c8');
    expect(decimalToHexBytes(789, 8)).toBe('0000000000000315');
  });

  test('converts decimal number to hexadecimal string with default bytes (8)', () => {
    expect(decimalToHexBytes(123, 8)).toBe('000000000000007b');
    expect(decimalToHexBytes(456, 8)).toBe('00000000000001c8');
    expect(decimalToHexBytes(789, 8)).toBe('0000000000000315');
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

describe('hexBytesToDecimal', () => {
  test('converts hexadecimal string to decimal number', () => {
    expect(hexBytesToDecimal('0000007b')).toBe(123);
    expect(hexBytesToDecimal('000001c8')).toBe(456);
    expect(hexBytesToDecimal('00000315')).toBe(789);
  });

  test('handles hexadecimal string with "0x" prefix', () => {
    expect(hexBytesToDecimal('0x0000007b')).toBe(123);
    expect(hexBytesToDecimal('0x000001c8')).toBe(456);
    expect(hexBytesToDecimal('0x00000315')).toBe(789);
  });
});

describe('unpackNodeOperatorIds', () => {
  test('unpacks packed hexadecimal string into array of decimal numbers', () => {
    const packedHex = '0x000000000000007b00000000000001c80000000000000315';
    const expectedNodeOperatorIds = [123, 456, 789];
    expect(unpackNodeOperatorIds(packedHex)).toEqual(expectedNodeOperatorIds);
  });
});
