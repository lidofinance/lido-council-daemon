import { Signature } from '@ethersproject/bytes';

export interface MessageRequiredFields {
  type: MessageType;
  guardianAddress: string;
  guardianIndex: number;
}

export enum MessageType {
  PAUSE = 'pause',
  DEPOSIT = 'deposit',
}

export interface MessageDeposit extends MessageRequiredFields {
  depositRoot: string;
  keysOpIndex: number;
  blockNumber: number;
  blockHash: string;
  signature: Signature;
}

export interface MessagePause extends MessageRequiredFields {
  blockNumber: number;
  blockHash: string;
  signature: Signature;
}
