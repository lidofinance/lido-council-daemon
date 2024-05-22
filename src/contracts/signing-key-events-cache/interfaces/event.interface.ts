export interface SigningKeyEvent {
  operatorIndex: number;
  key: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
}

export interface SigningKeyEventsGroup {
  events: SigningKeyEvent[];
  startBlock: number;
  endBlock: number;
}
