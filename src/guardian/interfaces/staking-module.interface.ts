import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

export interface StakingModuleData {
  blockHash: string;
  vettedUnusedKeys: RegistryKey[];
  vettedKeys: RegistryKey[];
  nonce: number;
  stakingModuleId: number;
  stakingModuleAddress: string;
  lastChangedBlockHash: string;
  duplicatedKeys: RegistryKey[];
  invalidKeys: RegistryKey[];
  frontRunKeys: RegistryKey[];
  isModuleDepositsPaused: boolean;
}
