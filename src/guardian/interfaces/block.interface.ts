import { DepositEventGroup } from 'contracts/deposit';

export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  keysOpIndex: number;
  nextSigningKeys: string[];
  depositedEvents: DepositEventGroup;
  guardianAddress: string;
  guardianIndex: number;
  isDepositsPaused: boolean;
}
