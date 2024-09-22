export type MessagePingV1 = {
  blockNumber: number;
  app: {
    version: string;
  };
};

export type MessageDepositV1 = {
  blockNumber: number;
  blockHash: string;
  depositRoot: string;
  stakingModuleId: number;
  nonce: number;
  signature: {
    r: string;
    vs: string;
  };
  app: {
    version: string;
  };
};

export type MessageUnvetV1 = {
  blockNumber: number;
  blockHash: string;
  stakingModuleId: number;
  nonce: number;
  operatorIds: string;
  vettedKeysByOperator: string;
  signature: {
    r: string;
    vs: string;
  };
  app: {
    version: string;
  };
};

export type MessagePauseV2 = {
  blockNumber: number;
  blockHash: string;
  signature: {
    r: string;
    vs: string;
  };
  stakingModuleId: number;
  app: {
    version: string;
  };
};

export type MessagePauseV3 = {
  blockNumber: number;
  signature: {
    r: string;
    vs: string;
  };
  app: {
    version: string;
  };
};

export type MessagesDataMap = {
  MessagePingV1: MessagePingV1;
  MessageDepositV1: MessageDepositV1;
  MessageUnvetV1: MessageUnvetV1;
  MessagePauseV2: MessagePauseV2;
  MessagePauseV3: MessagePingV1;
};

export type MessagesNames = keyof MessagesDataMap;
