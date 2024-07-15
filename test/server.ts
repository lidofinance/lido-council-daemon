import { server } from 'ganache';
import { FORK_BLOCK, SECURITY_MODULE_OWNER, GANACHE_PORT } from './constants';

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

// Function to start the server
// const startServer = async () => {
//   const serverInstance = makeServer(FORK_BLOCK, 17000, [SECURITY_MODULE_OWNER]);

//   await serverInstance.listen(GANACHE_PORT);
//   console.log(
//     `Ganache server is running on port ${GANACHE_PORT} ${process.env.RPC_URL}`,
//   );
// };

// // Start the server
// startServer().catch((error) => {
//   console.error('Failed to start Ganache server:', error);
// });
