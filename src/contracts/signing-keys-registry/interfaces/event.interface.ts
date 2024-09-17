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
  startBlock: number;
  endBlock: number;
}
export interface SigningKeyEventsGroupWithStakingModules
  extends SigningKeyEventsGroup {
  stakingModulesAddresses: string[];
}
