import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

export interface StakingModuleData {
  blockHash: string;
  unusedKeys: string[];
  vettedUnusedKeys: RegistryKey[];
  nonce: number;
  stakingModuleId: number;
  lastChangedBlockHash: string;
}
