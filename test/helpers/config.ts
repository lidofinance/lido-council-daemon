import { CHAINS } from '@lido-nestjs/constants';

export const AGENT = {
  [CHAINS.Hoodi]: '0x0534aA41907c9631fae990960bCC72d75fA7cfeD',
  [CHAINS.Mainnet]: '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c',
};

export const DAO = {
  [CHAINS.Hoodi]: '0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d',
  [CHAINS.Mainnet]: '0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc',
};

export const EVM_SCRIPT_EXECUTOR = {
  [CHAINS.Hoodi]: '0x79a20FD0FA36453B2F45eAbab19bfef43575Ba9E',
  [CHAINS.Mainnet]: '0xFE5986E06210aC1eCC1aDCafc0cc7f8D63B3F977',
};

export const CHAIN_ID = 1; //560048;
