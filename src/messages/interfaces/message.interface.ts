import { Signature } from '@ethersproject/bytes';

export interface MessageRequiredFields {
  type: MessageType;
  guardianAddress: string;
  guardianIndex: number;
  stakingModuleId: number;
}

export enum MessageType {
  PAUSE = 'pause',
  DEPOSIT = 'deposit',
  PING = 'ping',
}

export interface MessageDeposit extends MessageRequiredFields {
  depositRoot: string;
  nonce: number;
  blockNumber: number;
  blockHash: string;
  signature: Signature;
}

export interface MessageMeta {
  app: MessageApp;
}

export interface MessageApp {
  version?: string;
  name?: string;
}

export interface MessagePause extends MessageRequiredFields {
  depositRoot: string;
  nonce: number;
  blockNumber: number;
  blockHash: string;
  signature: Signature;
}
