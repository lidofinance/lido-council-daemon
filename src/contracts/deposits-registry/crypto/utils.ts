import { fromHexString, toHexString } from '@chainsafe/ssz';
import { UintNum64 } from 'bls/bls.constants';
export { digest2Bytes32 } from '@chainsafe/as-sha256';
export { fromHexString, toHexString };

export const parseLittleEndian64 = (str: string) => {
  return UintNum64.deserialize(fromHexString(str));
};

export const toLittleEndian64 = (value: number): string => {
  return toHexString(UintNum64.serialize(value));
};

export const toLittleEndian64BigInt = (value: bigint): string => {
  return toHexString(UintNum64.serialize(Number(value)));
};
