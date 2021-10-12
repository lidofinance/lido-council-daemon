import { hexZeroPad } from '@ethersproject/bytes';

export const hexPadUnit256 = (hexString: string): string => {
  const uint256Size = 64;
  return hexZeroPad(hexString, uint256Size);
};
