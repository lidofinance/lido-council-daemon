export interface DepositEvent {
  pubkey: string;
  wc: string;
  amount: string;
  signature: string;
  tx: string;
  blockNumber: number;
  blockHash: string;
}

export interface DepositEventGroup {
  events: DepositEvent[];
  startBlock: number;
  endBlock: number;
}
