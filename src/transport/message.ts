export interface Message {
  // TODO think about binary

  prefix: string;
  depositRoot: string;
  keysOpIndex: bigint;
  blockHeight: bigint;
  memberIndex: bigint;
  v: string;
  r: string;
  s: string;
}
