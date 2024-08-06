import { server } from 'ganache';

export const makeServer = (
  startBlock: number,
  chainId: number,
  unlockedAccounts: string[],
) => {
  const rpcUrl = process.env.RPC_URL;
  const secretKey = process.env.WALLET_PRIVATE_KEY;

  return server({
    logging: {
      verbose: false,
      debug: false,
      quiet: true,
    },
    fork: { url: rpcUrl, blockNumber: startBlock },
    chain: {
      chainId,
    },
    wallet: {
      unlockedAccounts,
      accounts: [{ secretKey, balance: BigInt(1e18) * BigInt(100) }],
    },
  });
};
