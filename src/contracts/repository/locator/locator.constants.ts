import { CHAINS } from '@lido-sdk/constants';

export const LIDO_LOCATOR_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0x0000000000000000000000000000000000000000',
  [CHAINS.Goerli]: '0xFd5B65B7A17Fd5ebE882b9907793071235c5E943',
  [CHAINS.Zhejiang]: '0xbeB7bdCB1948A065789f2b72409f39dCABFcCe52',
};

export const getLidoLocatorAddress = (chainId: CHAINS): string => {
  const address = LIDO_LOCATOR_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
