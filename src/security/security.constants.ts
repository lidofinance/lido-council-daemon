import { CHAINS } from '@lido-sdk/constants';

export const DEPOSIT_SECURITY_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0x0000000000000000000000000000000000000000',
  [CHAINS.Goerli]: '0xab292f743261abc64ff67eb6c19c453744b55c24',
};

export const getDepositSecurityAddress = (chainId: CHAINS): string => {
  return DEPOSIT_SECURITY_BY_NETWORK[chainId];
};
