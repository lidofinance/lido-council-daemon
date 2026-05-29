import { BigNumber } from 'ethers';
import {
  defaultAbiCoder,
  hexZeroPad,
  hexlify,
  keccak256,
  solidityKeccak256,
  toUtf8Bytes,
} from 'ethers/lib/utils';

const UINT64_MASK = BigNumber.from('0xffffffffffffffff');
const ROUTER_STORAGE_POSITION_MASK = BigNumber.from(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00',
);

export const SR_LEGACY_STAKING_MODULES_MAPPING_POSITION = solidityKeccak256(
  ['string'],
  ['lido.StakingRouter.stakingModules'],
);
export const SR_LEGACY_INDICES_MAPPING_POSITION = solidityKeccak256(
  ['string'],
  ['lido.StakingRouter.stakingModuleIndicesOneBased'],
);
export const SR_LEGACY_MODULE_EXITED_COUNT_SLOT_OFFSET = 4;

export const SR_ROUTER_STORAGE_POSITION = BigNumber.from(
  keccak256(
    defaultAbiCoder.encode(
      ['uint256'],
      [
        BigNumber.from(
          keccak256(toUtf8Bytes('lido.StakingRouter.routerStorage')),
        ).sub(1),
      ],
    ),
  ),
).and(ROUTER_STORAGE_POSITION_MASK);

export const getLegacyModuleIndexSlot = (moduleId: number) =>
  solidityKeccak256(
    ['uint256', 'uint256'],
    [moduleId, SR_LEGACY_INDICES_MAPPING_POSITION],
  );

export const getLegacyModuleExitedCountSlot = (
  moduleIndexOneBased: BigNumber,
) => {
  const index = moduleIndexOneBased.sub(1);
  const structBase = BigNumber.from(
    solidityKeccak256(
      ['uint256', 'uint256'],
      [index, SR_LEGACY_STAKING_MODULES_MAPPING_POSITION],
    ),
  );

  return structBase
    .add(SR_LEGACY_MODULE_EXITED_COUNT_SLOT_OFFSET)
    .toHexString();
};

export const getModuleAccountingSlot = (moduleId: number) =>
  BigNumber.from(
    keccak256(
      defaultAbiCoder.encode(
        ['uint256', 'uint256'],
        [moduleId, SR_ROUTER_STORAGE_POSITION],
      ),
    ),
  )
    .add(2)
    .toHexString();

export const getModuleAccountingExitedCount = (storageValue: string) =>
  BigNumber.from(storageValue).shr(64).and(UINT64_MASK);

export const setModuleAccountingExitedCount = (
  storageValue: string,
  exitedValidatorsCount: BigNumber,
) => {
  const value = BigNumber.from(storageValue);
  const lower64Bits = value.and(UINT64_MASK);
  const upper128Bits = value.shr(128).shl(128);

  return hexZeroPad(
    upper128Bits
      .or(exitedValidatorsCount.and(UINT64_MASK).shl(64))
      .or(lower64Bits)
      .toHexString(),
    32,
  );
};

export const ZERO_STORAGE_VALUE = hexZeroPad(hexlify(0), 32);
