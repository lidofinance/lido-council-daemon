export interface BlockData {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  keysOpIndex: number;
  nextSigningKeys: string[];
  depositedPubKeys: Set<string>;
  guardianAddress: string;
  guardianIndex: number;
  isDepositsPaused: boolean;
}
