import { CHAINS } from '@lido-sdk/constants';
import { SecretKey } from '@chainsafe/blst';

import { fromHexString } from '@chainsafe/ssz';

// Node can be without cache and environment in actions is slow, account for that
export const TESTS_TIMEOUT = 30_000;

// Needs to be higher on gh actions for reliable runs
export const SLEEP_FOR_RESULT = 3_000;

// Addresses
export const SECURITY_MODULE = '0xe57025E250275cA56f92d76660DEcfc490C7E79A';
export const SECURITY_MODULE_OWNER =
  '0xa5F1d7D49F581136Cf6e58B32cBE9a2039C48bA1';
export const STAKING_ROUTER = '0xa3Dbd317E53D363176359E10948BA0b1c0A4c820';
export const NOP_REGISTRY = '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320';
export const DEPOSIT_CONTRACT = '0xff50ed3d0ec03aC01D4C79aAd74928BFF48a7b2b';
export const FAKE_SIMPLE_DVT = '0x0000000000000000000000000000000000000123';
// Withdrawal credentials
export const GOOD_WC =
  '0x010000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d762';
export const BAD_WC =
  '0x010000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d763';

// Fork node config
export const CHAIN_ID = CHAINS.Goerli;
export const FORK_BLOCK = 8895800;
export const UNLOCKED_ACCOUNTS = [SECURITY_MODULE_OWNER];
export const GANACHE_PORT = 8545;

// BLS key for the validator
export const BLS_PRIV_KEY =
  '1c6f88347d1286690c42ad2886b6b782d4884e00eabed174696de345696cfa65';

export const NO_PRIVKEY_MESSAGE =
  'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.';

export const sk = SecretKey.fromBytes(fromHexString(BLS_PRIV_KEY));
export const pk = sk.toPublicKey().toBytes();
