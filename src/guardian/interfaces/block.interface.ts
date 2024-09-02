import { VerifiedDepositedEventGroup } from 'contracts/deposits-registry';

export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  depositedEvents: VerifiedDepositedEventGroup;
  guardianAddress: string;
  guardianIndex: number;
  lidoWC: string;
  securityVersion: number;
  alreadyPausedDeposits: boolean;
  theftHappened: boolean;
  walletBalanceCritical: boolean;
}
