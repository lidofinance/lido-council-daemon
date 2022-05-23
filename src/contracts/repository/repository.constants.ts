import { CHAINS } from '@lido-sdk/constants';

export const LIDO_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  [CHAINS.Goerli]: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
};

export const getLidoAddress = (chainId: CHAINS): string => {
  const address = LIDO_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
