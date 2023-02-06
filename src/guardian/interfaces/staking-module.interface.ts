export interface StakingModuleData {
  blockHash: string;
  isDepositsPaused: boolean;
  unusedKeys: string[];
  nonce: number;
  stakingModuleId: number;
}
