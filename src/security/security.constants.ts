import { CHAINS } from '@lido-sdk/constants';

export const DEPOSIT_SECURITY_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0x0000000000000000000000000000000000000000',
  [CHAINS.Goerli]: '0x0000000000000000000000000000000000000000',
};

export const getDepositSecurityAddress = (chainId: CHAINS): string => {
  return DEPOSIT_SECURITY_BY_NETWORK[chainId];
};
