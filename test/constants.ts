import { CHAINS } from '@lido-sdk/constants';
import { SecretKey } from '@chainsafe/blst';

import { fromHexString } from '@chainsafe/ssz';

// Node can be without cache and environment in actions is slow, account for that
export const TESTS_TIMEOUT = 30_000;

// Needs to be higher on gh actions for reliable runs
export const SLEEP_FOR_RESULT = 3_000;

// Addresses
export const SECURITY_MODULE = '0xC77F8768774E1c9244BEed705C4354f2113CFc09';
// https://etherscan.io/address/0xC77F8768774E1c9244BEed705C4354f2113CFc09#readContract
// getOwner
export const SECURITY_MODULE_OWNER =
  '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c';
export const STAKING_ROUTER = '0xFdDf38947aFB03C621C71b06C9C70bce73f12999';
// https://github.com/lidofinance/lido-dao/blob/5fcedc6e9a9f3ec154e69cff47c2b9e25503a78a/deployed-mainnet.json#L114
export const NOP_REGISTRY = '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5';
export const DEPOSIT_CONTRACT = '0x00000000219ab540356cBB839Cbe05303d7705Fa';
export const FAKE_SIMPLE_DVT = '0x0000000000000000000000000000000000000123';
// Withdrawal credentials
// 0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f — mainnet
export const GOOD_WC =
  '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f';
export const BAD_WC =
  '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e291f';

// Fork node config
export const CHAIN_ID = CHAINS.Mainnet;
export const FORK_BLOCK = 19590694;
export const UNLOCKED_ACCOUNTS = [SECURITY_MODULE_OWNER];
export const GANACHE_PORT = 8545;

// BLS key for the validator
export const BLS_PRIV_KEY =
  '1c6f88347d1286690c42ad2886b6b782d4884e00eabed174696de345696cfa65';

export const NO_PRIVKEY_MESSAGE =
  'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.';

export const sk = SecretKey.fromBytes(fromHexString(BLS_PRIV_KEY));
export const pk = sk.toPublicKey().toBytes();
