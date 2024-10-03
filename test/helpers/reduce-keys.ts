import { solidityKeccak256, hexlify, hexZeroPad } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
import { StakingRouter } from './sr.contract';
import { testSetupProvider } from './provider';

export const CURATED_ONCHAIN_V1_TYPE = 'curated-onchain-v1';
export const COMMUNITY_ONCHAIN_V1_TYPE = 'community-onchain-v1';

// curated-onchain-v1 operator and keys reducing methods

const TOTAL_OPERATORS_COUNT_POSITION =
  '0xe2a589ae0816b289a9d29b7c085f8eba4b5525accca9fa8ff4dba3f5a41287e8';
const ACTIVE_OPERATORS_COUNT_POSITION =
  '0x6f5220989faafdc182d508d697678366f4e831f5f56166ad69bfc253fc548fb1';

// Helper function to convert decimal number to 16-character hexadecimal string
const to16 = (decimalNumber: number) => {
  // Convert the number to hex and pad it to 8 bytes (16 characters)
  return hexZeroPad(hexlify(decimalNumber), 8).replace('0x', '');
};

// SigningKeysStats bit replacement
// |--------- 64 bit ----------|--------- 64 bit ---------|--------- 64 bit ---------|--------- 64 bit ---------|
// | TOTAL_DEPOSITED_KEYS_COUNT|  TOTAL_KEYS_COUNT        | TOTAL_EXITED_KEYS_COUNT  | TOTAL_VETTED_KEYS_COUNT  |
// |      192 - 255            |      128 - 191           |      64 - 127            |      0 - 63              |
//
const signingKeysStatsReplacer = (keysCount: number) => {
  return `0x${to16(keysCount)}${to16(keysCount)}0000000000000000${to16(
    keysCount,
  )}`;
};

export const cutOperators = async (
  contractAddress: string,
  opCount: number,
) => {
  // cut node operators count

  const opCountInHex = hexZeroPad(hexlify(opCount), 32);

  // Set TOTAL_OPERATORS_COUNT to 3
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    TOTAL_OPERATORS_COUNT_POSITION,
    opCountInHex,
  ]);

  // Set ACTIVE_OPERATORS_COUNT to 3
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    ACTIVE_OPERATORS_COUNT_POSITION,
    opCountInHex,
  ]);
};

// Function to update the keys count in storage (cut keys)
export const cutKeys = async (
  contractAddress: string,
  noId: number,
  keysCount = 10,
) => {
  const [, , nodeOperatorsSlot2] = [
    // slot where operator with is nodId stored
    // active and rewardAddress fields will be stored in this slot
    solidityKeccak256(['uint256', 'uint256'], [noId, 0]),
    // string is dynamical, reference on name will be stored at 1 slot
    BigNumber.from(solidityKeccak256(['uint256', 'uint256'], [noId, 0]))
      .add(1)
      .toHexString(),
    // signingKeysStats will be stored at the next slot
    BigNumber.from(solidityKeccak256(['uint256', 'uint256'], [noId, 0]))
      .add(2)
      .toHexString(),
    // stuckPenaltyStats, targetValidatorsStats next two slots
  ];

  // Build replacement values for the keys and validators count
  const keys = signingKeysStatsReplacer(keysCount);

  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    nodeOperatorsSlot2,
    keys,
  ]);
};

export const cutCuratedTypeModuleState = async (
  contractAddress: string,
  opCount: number,
  keysCount: number,
) => {
  await cutOperators(contractAddress, opCount);

  for (let opId = 0; opId < opCount; opId++) {
    await cutKeys(contractAddress, opId, keysCount);
  }
};

// TODO: use community-onchain-v1 type in name
export const cutCommunityTypeModuleNodeOperators = async (
  contractAddress: string,
  newCount: number,
) => {
  const slotValue = await testSetupProvider.getStorageAt(contractAddress, 9);
  const nodeOperatorsCountSlotIndex = 9;
  const newOperatorsCount = hexZeroPad(hexlify(newCount), 8);
  const unchangedPart = slotValue.slice(18); // 0x + 8 byte
  const newStorageValue = newOperatorsCount + unchangedPart;
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    hexZeroPad(hexlify(nodeOperatorsCountSlotIndex), 32),
    newStorageValue,
  ]);
};

export const cutCommunityTypeModuleNodeOperatorsWithMask = async (
  contractAddress: string,
  newCount: number,
) => {
  // Get the current slot value (256 bits or 32 bytes)
  const slotValue = await testSetupProvider.getStorageAt(contractAddress, 9);

  // Convert slotValue from hex string to BigNumber for bitwise operations
  const currentSlot = BigNumber.from(slotValue);

  // Define a mask to clear the upper 64 bits where `_nodeOperatorsCount` is stored.
  // The mask will look like 0x0000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
  const mask = BigNumber.from(
    '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000',
  );

  // Clear the upper 64 bits of the slot value using the mask (AND operation)
  const clearedSlot = currentSlot.and(mask);

  // Convert newCount to 64-bit hex and shift it to the upper 64-bit position
  const newOperatorsCount = BigNumber.from(newCount).shl(192); // Shift left by 192 bits

  // Combine the cleared slot value and the new `_nodeOperatorsCount` (OR operation)
  const newStorageValue = clearedSlot.or(newOperatorsCount);

  // Update the slot with the new value
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    hexZeroPad(hexlify(9), 32), // Slot index 9, padded to 32 bytes
    hexZeroPad(newStorageValue.toHexString(), 32), // New storage value padded to 32 bytes
  ]);
};

export const cutKeysCuratedOnachainV1Modules = async () => {
  // get sr modules
  const sr = new StakingRouter();
  // get modules list
  const srModulesAddresses = sr.getStakingModulesAddresses(
    CURATED_ONCHAIN_V1_TYPE,
  );

  const CSM = '0x4562c3e63c2e586cD1651B958C22F88135aCAd4f';

  await cutCommunityTypeModuleNodeOperators(CSM, 3);

  // in cycle remove keys of all modules

  // TODO: reduce curated and sdvt operators to make update faster
  // now it is still not fast enough for e2e
  for (const srModuleAddress of srModulesAddresses) {
    await cutCuratedTypeModuleState(srModuleAddress, 3, 3);
  }
};
