import { VerifiedDepositedEventGroup } from 'contracts/deposits-registry';

export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  depositedEvents: VerifiedDepositedEventGroup;
  guardianAddress: string;
  guardianIndex: number;
  securityVersion: number;
  alreadyPausedDeposits: boolean;
  violationWCFound: boolean;
  walletBalanceCritical: boolean;
}
