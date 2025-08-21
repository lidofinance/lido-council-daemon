import { CHAINS } from 'contracts/repository/locator/locator.constants';

export const AGENT = {
  [CHAINS.Hoodi]: '0x0534aA41907c9631fae990960bCC72d75fA7cfeD',
};

export const DAO = {
  [CHAINS.Hoodi]: '0xA48DF029Fd2e5FCECB3886c5c2F60e3625A1E87d',
};

export const CHAIN_ID =
  process.env.E2E_CHAIN_ID || process.env.CHAIN_ID || '17000';
