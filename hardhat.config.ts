import { HardhatUserConfig } from 'hardhat/config';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL;
const secretKey = process.env.WALLET_PRIVATE_KEY;
const forkBlockNumber = process.env.E2E_FORK_BLOCK
  ? Number(process.env.E2E_FORK_BLOCK)
  : undefined;

if (
  forkBlockNumber !== undefined &&
  (!Number.isSafeInteger(forkBlockNumber) || forkBlockNumber <= 0)
) {
  throw new Error('E2E_FORK_BLOCK must be a positive safe integer');
}

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      chainId: 560048,
      ...(RPC_URL
        ? {
            forking: {
              url: RPC_URL,
              ...(forkBlockNumber ? { blockNumber: forkBlockNumber } : {}),
            },
          }
        : {}),
      ...(secretKey
        ? {
            accounts: [
              {
                privateKey: secretKey,
                balance: (BigInt(1e18) * BigInt(100)).toString(),
              },
            ],
          }
        : {}),
    },
  },
  solidity: {
    version: '0.8.4',
  },
};

export default config;
