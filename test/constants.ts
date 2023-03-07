import { CHAINS } from '@lido-sdk/constants';
import { SecretKey } from '@chainsafe/blst';

import { fromHexString } from '@chainsafe/ssz';

// Node can be without cache and environment in actions is slow, account for that
export const TESTS_TIMEOUT = 30_000;

// Needs to be higher on gh actions for reliable runs
export const SLEEP_FOR_RESULT = 3_000;

// Addresses
export const SECURITY_MODULE = '0x48bEdD13FF63F7Cd4d349233B6a57Bff285f8E32';
export const SECURITY_MODULE_OWNER =
  '0xa5F1d7D49F581136Cf6e58B32cBE9a2039C48bA1';
export const STAKING_ROUTER = '0xDd7d15490748a803AeC6987046311AF76a5A6502';
export const DEPOSIT_CONTRACT = '0x4242424242424242424242424242424242424242';
export const NOP_REGISTRY = '0x8a1E2986E52b441058325c315f83C9D4129bDF72';

// Withdrawal credentials
export const GOOD_WC =
  '0x0100000000000000000000008c5cba32b36fcbc04e7b15ba9b2fe14057590c6e';
export const BAD_WC =
  '0x0100000000000000000000008c5cba32b36fcbc04e7b15ba9b2fe14057590c7e';

// Fork node config
export const CHAIN_ID = CHAINS.Zhejiang;
export const FORK_BLOCK = 128976;
export const UNLOCKED_ACCOUNTS = [SECURITY_MODULE_OWNER];
export const GANACHE_PORT = 8545;

// BLS key for the validator
export const BLS_PRIV_KEY =
  '1c6f88347d1286690c42ad2886b6b782d4884e00eabed174696de345696cfa65';

export const NO_PRIVKEY_MESSAGE =
  'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.';

export const sk = SecretKey.fromBytes(fromHexString(BLS_PRIV_KEY));
export const pk = sk.toPublicKey().toBytes();
