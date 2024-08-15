import { VerifiedDepositEventGroup } from 'contracts/deposit';

export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  depositedEvents: VerifiedDepositEventGroup;
  guardianAddress: string;
  guardianIndex: number;
  lidoWC: string;
  securityVersion: number;
  alreadyPausedDeposits: boolean;
  theftHappened: boolean;
  walletBalanceCritical: boolean;
}
