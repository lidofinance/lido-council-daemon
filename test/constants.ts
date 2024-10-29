import { CHAINS } from '@lido-sdk/constants';
import { SecretKey } from '@chainsafe/blst';

import { fromHexString } from '@chainsafe/ssz';

// Node can be without cache and environment in actions is slow, account for that
export const TESTS_TIMEOUT = 30_000;

// Needs to be higher on gh actions for reliable runs
export const SLEEP_FOR_RESULT = 3_000;

// Addresses
export const SECURITY_MODULE = '0x808DE3b26Be9438F12E9B45528955EA94C17f217';
// https://holesky.etherscan.io/address/0x808DE3b26Be9438F12E9B45528955EA94C17f217#readContract
// getOwner
export const SECURITY_MODULE_OWNER =
  '0xE92329EC7ddB11D25e25b3c21eeBf11f15eB325d';

export const SECURITY_MODULE_V2 = '0x045dd46212a178428c088573a7d102b9d89a022a';
// https://holesky.etherscan.io/address/0x045dd46212a178428c088573a7d102b9d89a022a#readContract
// getOwner
export const SECURITY_MODULE_OWNER_V2 =
  '0xDA6bEE5441f2e6b364F3b25E85d5f3C29Bfb669E';
export const STAKING_ROUTER = '0xd6EbF043D30A7fe46D1Db32BA90a0A51207FE229';

// replace with locator

export const NOP_REGISTRY = '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC';
export const DEPOSIT_CONTRACT = '0x4242424242424242424242424242424242424242';
export const SIMPLE_DVT = '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6';
export const CSM = '0x4562c3e63c2e586cD1651B958C22F88135aCAd4f';
export const SANDBOX = '0xD6C2ce3BB8bea2832496Ac8b5144819719f343AC';

// Withdrawal credentials
export const LIDO_WC =
  '0x010000000000000000000000f0179dec45a37423ead4fad5fcb136197872ead9';
export const BAD_WC =
  '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e291f';

// Fork node config
export const CHAIN_ID = CHAINS.Holesky;

export const FORK_BLOCK = 1894357;
export const UNLOCKED_ACCOUNTS = [SECURITY_MODULE_OWNER];
export const GANACHE_PORT = 8545;

// BLS key for the validator
export const BLS_PRIV_KEY =
  '1c6f88347d1286690c42ad2886b6b782d4884e00eabed174696de345696cfa65';

export const NO_PRIVKEY_MESSAGE =
  'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.';

export const sk = SecretKey.fromBytes(fromHexString(BLS_PRIV_KEY));
export const pk = sk.toPublicKey().toBytes();
