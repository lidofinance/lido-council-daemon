import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

export interface StakingModuleData {
  blockHash: string;
  vettedUnusedKeys: RegistryKey[];
  nonce: number;
  stakingModuleId: number;
  stakingModuleAddress: string;
  lastChangedBlockHash: string;
  duplicatedKeys: RegistryKey[];
  invalidKeys: RegistryKey[];
  crossTypeKeys: RegistryKey[];
  frontRunKeys: RegistryKey[];
  unresolvedDuplicatedKeys: RegistryKey[];
  withdrawalCredentials: string;
  isModuleDepositsPaused: boolean;
}
