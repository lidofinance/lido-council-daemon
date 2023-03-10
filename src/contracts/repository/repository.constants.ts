import { CHAINS } from '@lido-sdk/constants';

export const LIDO_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  [CHAINS.Goerli]: '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F',
  [CHAINS.Zhejiang]: '0xDe82ADEd58dA35add75Ea4676239Ca169c8dCD15',
};

export const getLidoAddress = (chainId: CHAINS): string => {
  const address = LIDO_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};

export const DEPOSIT_SECURITY_BY_NETWORK: {
  [key in CHAINS]?: string;
} = {
  [CHAINS.Mainnet]: '0x710B3303fB508a84F10793c1106e32bE873C24cd',
  [CHAINS.Goerli]: '0x7DC1C1ff64078f73C98338e2f17D1996ffBb2eDe',
  [CHAINS.Zhejiang]: '0xaaB7034eB0C0556c61c4E2F5B9884abf9EE357c9',
};

export const getDepositSecurityAddress = (chainId: CHAINS): string => {
  const address = DEPOSIT_SECURITY_BY_NETWORK[chainId];
  if (!address) throw new Error(`Chain ${chainId} is not supported`);

  return address;
};
