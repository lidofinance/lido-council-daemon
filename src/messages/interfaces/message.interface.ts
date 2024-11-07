import { Signature } from '@ethersproject/bytes';

export interface MessageRequiredFields {
  type: MessageType;
  guardianAddress: string;
  guardianIndex: number;
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

export interface MessagePauseV2 extends MessageRequiredFields {
  depositRoot: string;
  nonce: number;
  blockNumber: number;
  blockHash: string;
  signature: Signature;
  stakingModuleId: number;
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
