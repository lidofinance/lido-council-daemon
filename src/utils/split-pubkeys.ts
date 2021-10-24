import { arrayify, hexlify } from '@ethersproject/bytes';

export const splitPubKeys = (
  hexString: string,
  pubkeyLength: number,
): string[] => {
  const byteArray = arrayify(hexString);
  const splittedKeys = splitPubKeysArray(byteArray, pubkeyLength).map((array) =>
    hexlify(array),
  );

  return splittedKeys;
};

export const splitPubKeysArray = (
  array: Uint8Array,
  keyLength: number,
): Uint8Array[] => {
  const keysNumber = array.length / keyLength;

  if (keyLength <= 0) throw new Error('Invalid key length size');
  if (keysNumber % 1 > 0) throw new Error('Invalid array length');

  const result: Uint8Array[] = [];
  for (let i = 0; i < array.length; i += keyLength) {
    result.push(array.slice(i, i + keyLength));
  }

  return result;
};
