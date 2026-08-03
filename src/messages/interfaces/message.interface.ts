import { Signature } from '@ethersproject/bytes';

export interface MessageRequiredFields {
  type: MessageType;
  guardianAddress: string;
  guardianIndex: number;
  /**
   * Version of the DSM this message is signed for. It selects the event, because
   * v3/v4 take the compact `(r, vs)` pair while v5 takes the 65-byte blob its
   * guardian's ERC-1271 check accepts. Consumers read the same fact from
   * `DepositSecurityModule.VERSION()`.
   */
  dsmVersion?: number;
}

export enum MessageType {
  PAUSE = 'pause',
  DEPOSIT = 'deposit',
  PING = 'ping',
  UNVET = 'unvet',
}

export interface MessageDeposit extends MessageRequiredFields {
  depositRoot: string;
  nonce: number;
  blockNumber: number;
  blockHash: string;
  signature: Signature;
  stakingModuleId: number;
}

export interface MessageMeta {
  app: MessageApp;
}

export interface MessageApp {
  version?: string;
  name?: string;
}

export interface MessagePauseV3 extends MessageRequiredFields {
  blockNumber: number;
  blockHash: string;
  signature: Signature;
}

export interface MessageUnvet extends MessageRequiredFields {
  nonce: number;
  blockNumber: number;
  blockHash: string;
  stakingModuleId: number;
  signature: Signature;
  operatorIds: string;
  vettedKeysByOperator: string;
}
