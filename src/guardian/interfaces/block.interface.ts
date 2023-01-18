import { VerifiedDepositEventGroup } from 'contracts/deposit';

export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  depositedEvents: VerifiedDepositEventGroup;
  guardianAddress: string;
  guardianIndex: number;
  isDepositsPaused: boolean;
  keys: string[];
  nonce: number;
  srModuleId: number;
}
