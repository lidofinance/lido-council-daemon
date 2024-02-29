export interface DepositEvent {
  pubkey: string;
  wc: string;
  amount: string;
  signature: string;
  tx: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
}

export interface VerifiedDepositEvent extends DepositEvent {
  valid: boolean;
}

export interface DepositEventGroup {
  events: DepositEvent[];
  startBlock: number;
  endBlock: number;
}

export interface VerifiedDepositEventGroup extends DepositEventGroup {
  events: VerifiedDepositEvent[];
}
