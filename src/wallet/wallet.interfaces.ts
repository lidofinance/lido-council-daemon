export interface GuardianSigningIdentity {
  dsmVersion?: 3 | 4 | 5;
  guardianAddress?: string;
}

export interface SignDepositDataParams extends GuardianSigningIdentity {
  prefix: string;
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  nonce: number;
  stakingModuleId: number;
}

export interface SignPauseDataParams extends GuardianSigningIdentity {
  prefix: string;
  blockNumber: number;
}

export interface SignUnvetDataParams extends GuardianSigningIdentity {
  prefix: string;
  blockNumber: number;
  blockHash: string;
  stakingModuleId: number;
  nonce: number;
  operatorIds: string;
  vettedKeysByOperator: string;
}
