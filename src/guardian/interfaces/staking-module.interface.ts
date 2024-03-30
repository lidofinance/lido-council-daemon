import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

export interface StakingModuleData {
  blockHash: string;
  unusedKeys: string[];
  nonce: number;
  isDepositsPaused: boolean;
  stakingModuleId: number;
  stakingModuleAddress: string;
  lastChangedBlockHash: string;
}

export interface StakingModuleData2 {
  blockHash: string;
  unusedKeys: string[];
  vettedUnusedKeys: RegistryKey[];
  nonce: number;
  stakingModuleId: number;
  lastChangedBlockHash: string;
}
