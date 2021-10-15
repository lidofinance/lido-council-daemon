import { CHAINS } from '@lido-sdk/constants';

export const DEPOSIT_SECURITY_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0x0000000000000000000000000000000000000000', // TODO
  [CHAINS.Goerli]: '0x3E4Fa99107aD166380A9F5523BbacAcD1e24909C',
};

export const getDepositSecurityAddress = (chainId: CHAINS): string => {
  const address = DEPOSIT_SECURITY_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};

export enum MessageType {
  PAUSE = 'pause',
  DEPOSIT = 'deposit',
}
