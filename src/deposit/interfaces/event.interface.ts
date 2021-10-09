export interface DepositEvent {
  pubkey: string;
  wc: string;
  amount: string;
  signature: string;
  index: string;
}

export interface DepositEventGroup {
  events: DepositEvent[];
  startBlock: number;
  endBlock: number;
}
