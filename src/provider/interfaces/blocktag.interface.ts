export type BlockTag =
  | string
  | number
  | { blockNumber: string }
  | { blockHash: string; requireCanonical?: boolean };
