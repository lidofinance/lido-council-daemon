import { splitPubKeys, splitPubKeysArray } from './split-pubkeys';

describe('splitPubKeys', () => {
  const keyLength = 2;

  it('should return an array of keys', async () => {
    const result = splitPubKeys('0x12345678', keyLength);
    expect(result).toEqual(['0x1234', '0x5678']);
  });

  it('should work with empty keys', async () => {
    const result = splitPubKeys('0x', keyLength);
    expect(result).toEqual([]);
  });

  it('should throw if source string is not divisible by the key length', async () => {
    expect(() => splitPubKeys('0x12345', keyLength)).toThrow();
  });
});

describe('splitPubKeysArray', () => {
  it('should split array into two chunks', () => {
    const splitted = splitPubKeysArray(Uint8Array.from([1, 2, 3, 4]), 2);

    expect(splitted).toEqual([
      Uint8Array.from([1, 2]),
      Uint8Array.from([3, 4]),
    ]);
  });

  it('should work with empty array', () => {
    const splitted = splitPubKeysArray(Uint8Array.from([]), 2);
    expect(splitted).toEqual([]);
  });

  it('should throw if length is not divisible by the key length', () => {
    expect(() => splitPubKeysArray(Uint8Array.from([1, 2, 3]), 2)).toThrow();
  });
});
