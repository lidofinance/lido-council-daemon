import { VerifiedDepositedEventGroup } from 'contracts/deposits-registry';
import { GuardianExecutionContext } from 'contracts/security';

export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  depositedEvents: VerifiedDepositedEventGroup;
  guardianContext: GuardianExecutionContext;
  guardianAddress: string;
  guardianIndex: number;
  securityVersion: number;
  alreadyPausedDeposits: boolean;
  hasFrontRunning: boolean;
  hasWrongWCType: boolean;
  walletBalanceCritical: boolean;
}
