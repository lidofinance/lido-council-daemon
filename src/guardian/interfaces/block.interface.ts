import { DepositEventGroup } from 'contracts/deposit';
import { NodeOperatorsCache } from 'contracts/registry/interfaces';

export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  keysOpIndex: number;
  nextSigningKeys: string[];
  nodeOperatorsCache: NodeOperatorsCache;
  depositedEvents: DepositEventGroup;
  guardianAddress: string;
  guardianIndex: number;
  isDepositsPaused: boolean;
}
