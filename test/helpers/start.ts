import { HardhatFork, waitForServerStdout } from './hardhat-fork';

const FORK_URL =
  'http://hr6vb81d1ndsx-rpc-5-holesky-geth.tooling-nodes.testnet.fi';
const FORK_BLOCK = 1894357;

const main = async () => {
  const hardhatFork = new HardhatFork(
    FORK_URL, // Pass your fork URL (e.g., Infura URL)
    FORK_BLOCK, // Fork at a specific block number
    '8545', // Port to run on (optional)
  );

  // Start the Hardhat node and await it to finish starting up
  await hardhatFork.start();

  console.log('out: ', hardhatFork.process?.stdout);

  if (hardhatFork.process?.stdout) {
    const isServerReady = await waitForServerStdout(hardhatFork.process.stdout);
    if (isServerReady) {
      console.log('Hardhat node is up and running!');
    }
  } else {
    console.error('Hardhat process did not initialize properly.');
  }

  // Perform tests or interactions...

  // Stop the Hardhat node when done
  hardhatFork.stop();
};

main().catch((err) => {
  console.error('Error:', err);
});
