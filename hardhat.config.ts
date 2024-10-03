import { HardhatUserConfig } from 'hardhat/config';

// for v3 version
export const FORK_BLOCK = 1894357;

// TODO: add check that RPC_URL is for holesky
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const rpcUrl = process.env.RPC_URL!;
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const secretKey = process.env.WALLET_PRIVATE_KEY!;

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      forking: {
        url: rpcUrl,
        blockNumber: FORK_BLOCK,
      },
      chainId: 17000,
      accounts: [
        {
          privateKey: secretKey,
          balance: (BigInt(1e18) * BigInt(100)).toString(),
        },
      ],
    },
  },
  solidity: '0.8.4',
};

export default config;
