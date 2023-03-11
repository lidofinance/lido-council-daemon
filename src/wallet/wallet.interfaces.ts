export interface SignDepositDataParams {
  prefix: string;
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  keysOpIndex: number;
  stakingModuleId: number;
}

export interface SignPauseDataParams {
  prefix: string;
  blockNumber: number;
  stakingModuleId: number;
}
