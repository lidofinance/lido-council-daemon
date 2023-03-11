import { CHAINS } from '@lido-sdk/constants';
import { SecretKey } from '@chainsafe/blst';

import { fromHexString } from '@chainsafe/ssz';

// Node can be without cache and environment in actions is slow, account for that
export const TESTS_TIMEOUT = 30_000;

// Needs to be higher on gh actions for reliable runs
export const SLEEP_FOR_RESULT = 3_000;

// Addresses
export const SECURITY_MODULE = '0xaaB7034eB0C0556c61c4E2F5B9884abf9EE357c9';
export const SECURITY_MODULE_OWNER =
  '0xa5F1d7D49F581136Cf6e58B32cBE9a2039C48bA1';
export const STAKING_ROUTER = '0x0Ed4aCd69f6e00a2Ca0d141f8A900aC6BFaF70F0';
export const DEPOSIT_CONTRACT = '0x4242424242424242424242424242424242424242';
export const NOP_REGISTRY = '0xB099EC462e42Ac2570fB298B42083D7A499045D8';

// Withdrawal credentials
export const GOOD_WC =
  '0x010000000000000000000000fd7003eec1f70a3919005f72f8b0a848c56906be';
export const BAD_WC =
  '0x010000000000000000000000fd7003eec1f70a3919005f72f8b0a848c56906bf';

// Fork node config
export const CHAIN_ID = CHAINS.Zhejiang;
export const FORK_BLOCK = 260000;
export const UNLOCKED_ACCOUNTS = [SECURITY_MODULE_OWNER];
export const GANACHE_PORT = 8545;

// BLS key for the validator
export const BLS_PRIV_KEY =
  '1c6f88347d1286690c42ad2886b6b782d4884e00eabed174696de345696cfa65';

export const NO_PRIVKEY_MESSAGE =
  'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.';

export const sk = SecretKey.fromBytes(fromHexString(BLS_PRIV_KEY));
export const pk = sk.toPublicKey().toBytes();
