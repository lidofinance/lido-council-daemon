import {
  solidityKeccak256,
  hexlify,
  zeroPad,
  hexZeroPad,
} from 'ethers/lib/utils';
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

export const updateNodeOperatorsCount = async (
  contractAddress: string,
  newCount: number,
) => {
  console.log('updateNodeOperatorsCount');

  const slotValue = await testSetupProvider.getStorageAt(contractAddress, 9);
  console.log('Current value in slot:', slotValue);

  const slotIndex = 9;

  const newOperatorsCount = hexZeroPad(hexlify(newCount), 8);

  const unchangedPart = slotValue.slice(18);

  const newStorageValue = newOperatorsCount + unchangedPart;

  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    hexZeroPad(hexlify(slotIndex), 32),
    newStorageValue,
  ]);
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
  // await testSetupProvider.send('hardhat_setStorageAt', [
  //   norAddress,
  //   nodeOperatorsSlot4,
  //   validators,
  // ]);

  // console.log(`Keys updated for Node Operator ID ${noId} at ${norAddress}`);
};

export const cutKeysCuratedOnachainV1Modules = async () => {
  // get sr modules
  const sr = new StakingRouter();
  // get modules list
  const srModulesAddresses = sr.getStakingModulesAddresses(
    CURATED_ONCHAIN_V1_TYPE,
  );

  const CSM = '0x4562c3e63c2e586cD1651B958C22F88135aCAd4f';

  await updateNodeOperatorsCount(CSM, 3);

  // in cycle remove keys of all modules

  // TODO: reduce curated and sdvt operators to make update faster
  // now it is still not fast enough for e2e
  for (const srModuleAddress of srModulesAddresses) {
    // ask operators number
    const contract = new CuratedOnchainV1(srModuleAddress);
    const operatorsCount = await contract.getOperatorsCount(FORK_BLOCK);

    for (let index = 0; index < operatorsCount; index++) {
      // Perform asynchronous operation inside the loop
      await cutKeys(index, srModuleAddress, 3);
      console.log('Cut keys', { index, srModuleAddress });
    }
  }
};
