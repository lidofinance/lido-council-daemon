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
