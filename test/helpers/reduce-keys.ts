import { solidityKeccak256, hexlify, hexZeroPad } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
import { getLocator, getStakingModules, getType } from './sr.contract';
import { testSetupProvider } from './provider';

export const CURATED_ONCHAIN_V1_TYPE = 'curated-onchain-v1';
export const COMMUNITY_ONCHAIN_V1_TYPE = 'community-onchain-v1';
const OPERATORS_COUNT = 3;
const KEYS_COUNT = 3;
const DEPOSITED_COUNT = 0;

export type CutConfig = {
  opCount: number;
  keysCount: number;
  // Per-operator deposited count. Must satisfy 0 <= deposited <= keysCount.
  // 0 -> module reports `opCount * keysCount` depositable keys.
  // keysCount -> module reports 0 depositable keys (everything already deposited).
  depositedCount: number;
};

// curated-onchain-v1 operator and keys reducing methods

const TOTAL_OPERATORS_COUNT_POSITION =
  '0xe2a589ae0816b289a9d29b7c085f8eba4b5525accca9fa8ff4dba3f5a41287e8';
const ACTIVE_OPERATORS_COUNT_POSITION =
  '0x6f5220989faafdc182d508d697678366f4e831f5f56166ad69bfc253fc548fb1';

// _nodeOperators mapping is at sequential slot 0 (AragonApp/Versioned use only unstructured storage),
// so _nodeOperatorSummary.summarySigningKeysStats.v sits at slot 1.
const NOR_SUMMARY_SIGNING_KEYS_STATS_SLOT = hexZeroPad(hexlify(1), 32);

// StakingRouter unstructured storage positions.
const SR_STAKING_MODULES_MAPPING_POSITION = solidityKeccak256(
  ['string'],
  ['lido.StakingRouter.stakingModules'],
);
const SR_INDICES_MAPPING_POSITION = solidityKeccak256(
  ['string'],
  ['lido.StakingRouter.stakingModuleIndicesOneBased'],
);
// Offset of StakingModule.exitedValidatorsCount within the struct (slots 0..5).
const SR_MODULE_EXITED_COUNT_SLOT_OFFSET = 4;

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
// Invariant (NodeOperatorsRegistry.sol):
//   exited <= deposited <= vetted <= total
// We set exited=0, vetted=total=keysCount, deposited=depositedCount.
const signingKeysStatsReplacer = (
  keysCount: number,
  depositedCount: number,
) => {
  return `0x${to16(depositedCount)}${to16(keysCount)}0000000000000000${to16(
    keysCount,
  )}`;
};

// NOR _nodeOperatorSummary.summarySigningKeysStats Packed64x4 layout:
// offset 0 = SUMMARY_MAX_VALIDATORS_COUNT (low 64 bits)
// offset 1 = SUMMARY_EXITED_KEYS_COUNT
// offset 2 = SUMMARY_TOTAL_KEYS_COUNT (deprecated)
// offset 3 = SUMMARY_DEPOSITED_KEYS_COUNT (high 64 bits)
// Must match aggregate of per-operator cuts, otherwise getStakingModuleSummary/SR allocator underflows.
const summarySigningKeysStatsReplacer = (
  maxValidators: number,
  deposited: number,
  total: number,
) => {
  return `0x${to16(deposited)}${to16(total)}0000000000000000${to16(
    maxValidators,
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

// NodeOperator struct layout inside the _nodeOperators[id] mapping slot (sequential storage packing):
// base+0: active + rewardAddress
// base+1: name (dynamic string ref)
// base+2: signingKeysStats (Packed64x4)
// base+3: stuckPenaltyStats (Packed64x4)
// base+4: targetValidatorsStats (Packed64x4)
const operatorSlot = (noId: number, offset: number) =>
  BigNumber.from(solidityKeccak256(['uint256', 'uint256'], [noId, 0]))
    .add(offset)
    .toHexString();

// targetValidatorsStats offsets (NodeOperatorsRegistry.sol):
//   0 = TARGET_LIMIT_MODE, 1 = TARGET_VALIDATORS_COUNT, 2 = MAX_VALIDATORS_COUNT, 3 = unused
// hex MSB -> LSB: offset3 | offset2 | offset1 | offset0
const targetValidatorsStatsReplacer = (maxValidatorsCount: number) =>
  `0x0000000000000000${to16(
    maxValidatorsCount,
  )}00000000000000000000000000000000`;

// Function to update the keys count in storage (cut keys)
export const cutKeys = async (
  contractAddress: string,
  noId: number,
  keysCount = 10,
  depositedCount = 0,
) => {
  // signingKeysStats: vetted=total=keysCount, deposited=depositedCount, exited=0
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    operatorSlot(noId, 2),
    signingKeysStatsReplacer(keysCount, depositedCount),
  ]);

  // stuckPenaltyStats: zero out — mainnet values would desync with our cut deposited/exited counts
  // and trigger Packed64x4.sub underflow in _updateStuckValidatorsCount / _applyNodeOperatorLimits.
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    operatorSlot(noId, 3),
    hexZeroPad('0x00', 32),
  ]);

  // targetValidatorsStats.MAX_VALIDATORS_COUNT must equal our new vetted (keysCount), otherwise
  // _updateSummaryMaxValidatorsCount computes a huge delta vs summary.MAX and underflows.
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    operatorSlot(noId, 4),
    targetValidatorsStatsReplacer(keysCount),
  ]);
};

// Rewrite NOR aggregate summary so it matches the per-operator cuts.
// Summary must equal the sum across operators: total = max = opCount*keysCount, deposited = opCount*depositedCount.
// depositable = summary.MAX - summary.DEPOSITED = opCount * (keysCount - depositedCount).
export const cutNorSummary = async (
  contractAddress: string,
  opCount: number,
  keysCount: number,
  depositedCount: number,
) => {
  const totalAggregate = opCount * keysCount;
  const depositedAggregate = opCount * depositedCount;
  const value = summarySigningKeysStatsReplacer(
    totalAggregate,
    depositedAggregate,
    totalAggregate,
  );
  await testSetupProvider.send('hardhat_setStorageAt', [
    contractAddress,
    NOR_SUMMARY_SIGNING_KEYS_STATS_SLOT,
    value,
  ]);
};

// SR stores its own exitedValidatorsCount per module. On a mainnet fork it holds huge values,
// while after cuts NOR summary reports deposited << that — causing underflow at
// StakingRouter._loadStakingModulesCacheItem: totalDepositedValidators - max(totalExited, stakingModule.exitedValidatorsCount).
export const cutSRModuleExitedCount = async (
  srAddress: string,
  moduleId: number,
) => {
  const indexKeySlot = solidityKeccak256(
    ['uint256', 'uint256'],
    [moduleId, SR_INDICES_MAPPING_POSITION],
  );
  const indexOneBasedHex = await testSetupProvider.getStorageAt(
    srAddress,
    indexKeySlot,
  );
  const indexOneBased = BigNumber.from(indexOneBasedHex);
  if (indexOneBased.isZero()) {
    throw new Error(`StakingRouter: module ${moduleId} is not registered`);
  }
  const index = indexOneBased.sub(1);
  const structBase = BigNumber.from(
    solidityKeccak256(
      ['uint256', 'uint256'],
      [index, SR_STAKING_MODULES_MAPPING_POSITION],
    ),
  );
  const exitedSlot = structBase
    .add(SR_MODULE_EXITED_COUNT_SLOT_OFFSET)
    .toHexString();
  await testSetupProvider.send('hardhat_setStorageAt', [
    srAddress,
    exitedSlot,
    hexZeroPad('0x00', 32),
  ]);
};

export const cutCuratedTypeModuleState = async (
  contractAddress: string,
  opCount: number,
  keysCount: number,
  depositedCount: number,
) => {
  if (depositedCount > keysCount) {
    throw new Error(
      `cutCuratedTypeModuleState: depositedCount (${depositedCount}) must not exceed keysCount (${keysCount})`,
    );
  }

  await cutOperators(contractAddress, opCount);

  for (let opId = 0; opId < opCount; opId++) {
    await cutKeys(contractAddress, opId, keysCount, depositedCount);
  }

  await cutNorSummary(contractAddress, opCount, keysCount, depositedCount);
};

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

export const cutModulesKeys = async (
  stakingRouterAddress?: string,
  config: CutConfig = {
    opCount: OPERATORS_COUNT,
    keysCount: KEYS_COUNT,
    depositedCount: DEPOSITED_COUNT,
  },
) => {
  const { opCount, keysCount, depositedCount } = config;

  if (!stakingRouterAddress) {
    const locator = getLocator();
    stakingRouterAddress = await locator.stakingRouter();
  }

  // get sr modules
  const stakingModules = await getStakingModules();

  for (const stakingModule of stakingModules) {
    const type = await getType(stakingModule.stakingModuleAddress);
    if (type === CURATED_ONCHAIN_V1_TYPE) {
      await cutCuratedTypeModuleState(
        stakingModule.stakingModuleAddress,
        opCount,
        keysCount,
        depositedCount,
      );
    } else if (type === COMMUNITY_ONCHAIN_V1_TYPE) {
      await cutCommunityTypeModuleNodeOperators(
        stakingModule.stakingModuleAddress,
        opCount,
      );
    } else {
      continue;
    }

    // Keep SR's stored exited counter consistent with the (much smaller) post-cut module state.
    await cutSRModuleExitedCount(stakingRouterAddress, stakingModule.id);
  }
};
