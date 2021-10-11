import { hexZeroPad } from '@ethersproject/bytes';

export const hexPadUnit64 = (hexString: string): string => {
  const uint256Size = 64;
  return hexZeroPad(hexString, uint256Size);
};
