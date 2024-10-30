import axios from 'axios';
import { cutModulesKeys } from './reduce-keys';
// Функция для проверки доступности Hardhat по HTTP
async function isHardhatNodeReady(): Promise<boolean> {
  try {
    const response = await axios.post('http://127.0.0.1:8545', {
      jsonrpc: '2.0',
      id: 1,
      method: 'web3_clientVersion',
      params: [],
    });
    return response.status === 200;
  } catch (error: any) {
    console.error(
      'Error while checking Hardhat node readiness:',
      error.message,
    );
    return false;
  }
}

async function main() {
  try {
    console.log('Waiting for Hardhat node to be ready...');

    let hardhatReady = false;
    while (!hardhatReady) {
      hardhatReady = await isHardhatNodeReady();
      if (!hardhatReady) {
        console.log('Hardhat node is not ready yet. Retrying in 5 seconds...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log('Hardhat node is ready. Starting key cutting process...');
    await cutModulesKeys();
    console.log('Key cutting completed.');
    process.exit(0);
  } catch (error) {
    console.error('Error occurred during key cutting process:', error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error in main execution:', err);
  process.exit(1);
});
