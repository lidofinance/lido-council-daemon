export interface SignDepositDataParams {
  prefix: string;
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  nonce: number;
  stakingModuleId: number;
}

export interface SignPauseDataParams {
  prefix: string;
  blockNumber: number;
}

export interface SignModulePauseDataParams {
  prefix: string;
  blockNumber: number;
  stakingModuleId: number;
}

export interface SignUnvetDataParams {
  prefix: string;
  blockNumber: number;
  blockHash: string;
  stakingModuleId: number;
  nonce: number;
  operatorIds: string;
  vettedKeysByOperator: string;
}
