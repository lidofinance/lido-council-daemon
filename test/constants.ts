import { SecretKey } from '@chainsafe/blst';

import { fromHexString } from '@chainsafe/ssz';

// Node can be without cache and environment in actions is slow, account for that
export const TESTS_TIMEOUT = 30_000;

// Needs to be higher on gh actions for reliable runs
export const SLEEP_FOR_RESULT = 3_000;

// Withdrawal credentials
export const BAD_WC =
  '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e291f';

export const TEST_SERVER_PORT = 8545;
export const TEST_SERVER_URL = 'http://127.0.0.1:8545';

// BLS key for the validator
export const BLS_PRIV_KEY =
  '1c6f88347d1286690c42ad2886b6b782d4884e00eabed174696de345696cfa65';

export const NO_PRIVKEY_MESSAGE =
  'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.';

export const sk = SecretKey.fromBytes(fromHexString(BLS_PRIV_KEY));
export const pk = sk.toPublicKey().toBytes();
