export type ELBlockSnapshot = {
  /**
   * Block number
   */
  blockNumber: number;
  /**
   * Block hash
   */
  blockHash: string;
  /**
   * Block timestamp
   */
  timestamp: number;

  /**
   * Blockhash from the most recent data update
   */
  lastChangedBlockHash: string;
};
