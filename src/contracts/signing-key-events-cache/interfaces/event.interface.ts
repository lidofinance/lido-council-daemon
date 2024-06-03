export interface SigningKeyEvent {
  operatorIndex: number;
  key: string;
  moduleAddress: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
}

export interface SigningKeyEventsGroup {
  events: SigningKeyEvent[];
  stakingModulesAddresses: string[];
  startBlock: number;
  endBlock: number;
}
