import { CHAINS } from '@lido-sdk/constants';

export const DEPOSIT_SECURITY_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0xDb149235B6F40dC08810AA69869783Be101790e7',
  [CHAINS.Goerli]: '0xed23ad3ea5fb9d10e7371caef1b141ad1c23a80c',
};

export const getDepositSecurityAddress = (chainId: CHAINS): string => {
  const address = DEPOSIT_SECURITY_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
