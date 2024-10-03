import { network } from 'hardhat';
import { solidityKeccak256 } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';

// Helper function to convert decimal number to 16-character hexadecimal string
const to16 = (decimalNumber: number) => {
  let hexString = decimalNumber.toString(16);
  while (hexString.length < 16) {
    hexString = '0' + hexString;
  }
  return hexString;
};

// Build replacement values for the storage slots
const buildReplacer = (keysCount: number) => {
  return [
    `0x${to16(keysCount)}${to16(keysCount)}0000000000000000${to16(keysCount)}`,
    `0x0000000000000000${to16(keysCount)}00000000000000000000000000000000`,
  ];
};

// Function to update the keys count in storage (cut keys)
export const cutKeys = async (
  noId: number,
  norAddress: string,
  keysCount = 10,
) => {
  const [, , nodeOperatorsSlot2, , nodeOperatorsSlot4] = [
    solidityKeccak256(['uint256', 'uint256'], [noId, 0]),
    BigNumber.from(solidityKeccak256(['uint256', 'uint256'], [noId, 0]))
      .add(1)
      .toHexString(),
    BigNumber.from(solidityKeccak256(['uint256', 'uint256'], [noId, 0]))
      .add(2)
      .toHexString(),
    BigNumber.from(solidityKeccak256(['uint256', 'uint256'], [noId, 0]))
      .add(3)
      .toHexString(),
    BigNumber.from(solidityKeccak256(['uint256', 'uint256'], [noId, 0]))
      .add(4)
      .toHexString(),
  ];

  // Build replacement values for the keys and validators count
  const [keys, validators] = buildReplacer(keysCount);

  // Send Hardhat RPC commands to modify the storage slots directly
  await network.provider.send('hardhat_setStorageAt', [
    norAddress,
    nodeOperatorsSlot2,
    keys,
  ]);
  await network.provider.send('hardhat_setStorageAt', [
    norAddress,
    nodeOperatorsSlot4,
    validators,
  ]);

  console.log(`Keys updated for Node Operator ID ${noId} at ${norAddress}`);
};

// Run the script from the command line
// const main = async () => {
//   const noId = 0; // Example Node Operator ID
//   const norAddress = '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC'; // Replace with your contract address
//   const keysCount = 10; // Example keys count, you can change this

//   console.log('Starting cutKeys operation...');
//   await cutKeys(noId, norAddress, keysCount);

//   console.log('cutKeys operation completed.');
// };

// main().catch((error) => {
//   console.error('Error executing script:', error);
//   process.exit(1);
// });
