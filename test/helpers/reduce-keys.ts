import { solidityKeccak256 } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
import { StakingRouter } from './sr.contract';
// import { CURATED_ONCHAIN_V1_TYPE } from 'contracts/repository';
import { testSetupProvider } from './provider';
import { CuratedOnchainV1 } from './nor.contract';
import { FORK_BLOCK } from '../constants';

export const CURATED_ONCHAIN_V1_TYPE = 'curated-onchain-v1';
export const COMMUNITY_ONCHAIN_V1_TYPE = 'community-onchain-v1';

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
  await testSetupProvider.send('hardhat_setStorageAt', [
    norAddress,
    nodeOperatorsSlot2,
    keys,
  ]);
  await testSetupProvider.send('hardhat_setStorageAt', [
    norAddress,
    nodeOperatorsSlot4,
    validators,
  ]);

  // console.log(`Keys updated for Node Operator ID ${noId} at ${norAddress}`);
};

export const cutKeysCuratedOnachainV1Modules = async () => {
  // get sr modules
  const sr = new StakingRouter();
  // get modules list
  const srModulesAddresses = sr.getStakingModulesAddresses(
    CURATED_ONCHAIN_V1_TYPE,
  );

  // in cycle remove keys of all modules

  for (const srModuleAddress of srModulesAddresses) {
    // ask operators number
    const contract = new CuratedOnchainV1(srModuleAddress);
    const operatorsCount = await contract.getOperatorsCount(FORK_BLOCK);

    for (let index = 0; index < operatorsCount; index++) {
      // Perform asynchronous operation inside the loop
      await cutKeys(index, srModuleAddress, 2);
      console.log('Cut keys', { index, srModuleAddress });
    }
  }
};
