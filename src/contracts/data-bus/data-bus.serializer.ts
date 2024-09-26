import { z } from 'zod';
import { BigNumber, utils } from 'ethers';

// Common schemas
const BigNumberSchema = z
  .union([z.instanceof(BigNumber), z.string(), z.number()])
  .transform((bn) =>
    BigNumber.isBigNumber(bn) ? bn.toNumber() : bn.toString(),
  );

const SignatureSchema = z.object({
  r: z.string(),
  vs: z.string(),
});

const AppSchema = z.object({
  version: z.string(),
});

// Helper function to extract named properties from ethers Result
function extractNamedProperties(result: utils.Result): { [key: string]: any } {
  const namedProperties: { [key: string]: any } = {};
  for (const key in result) {
    if (isNaN(Number(key))) {
      namedProperties[key] = result[key];
    }
  }
  return namedProperties;
}

// 1. MessageDepositV1
const MessageDepositV1DataSchema = z.object({
  blockNumber: BigNumberSchema,
  blockHash: z.string(),
  depositRoot: z.string(),
  stakingModuleId: BigNumberSchema,
  nonce: BigNumberSchema,
  signature: SignatureSchema,
  app: AppSchema,
});

const MessageDepositV1EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessageDepositV1DataSchema,
});

// Mapping function
function mapMessageDepositV1(args: unknown) {
  const result = args as utils.Result;
  const namedArgs = extractNamedProperties(result);
  namedArgs.data = extractNamedProperties(namedArgs.data);
  namedArgs.data.signature = extractNamedProperties(namedArgs.data.signature);
  namedArgs.data.app = extractNamedProperties(namedArgs.data.app);

  return MessageDepositV1EventSchema.parse(namedArgs);
}

// 2. MessagePauseV2
const MessagePauseV2DataSchema = z.object({
  blockNumber: BigNumberSchema,
  blockHash: z.string(),
  signature: SignatureSchema,
  stakingModuleId: BigNumberSchema,
  app: AppSchema,
});

const MessagePauseV2EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessagePauseV2DataSchema,
});

function mapMessagePauseV2(args: unknown) {
  const result = args as utils.Result;
  const namedArgs = extractNamedProperties(result);
  namedArgs.data = extractNamedProperties(namedArgs.data);
  namedArgs.data.signature = extractNamedProperties(namedArgs.data.signature);
  namedArgs.data.app = extractNamedProperties(namedArgs.data.app);

  return MessagePauseV2EventSchema.parse(namedArgs);
}

// 3. MessagePauseV3
const MessagePauseV3DataSchema = z.object({
  blockNumber: BigNumberSchema,
  blockHash: z.string(),
  signature: SignatureSchema,
  app: AppSchema,
});

const MessagePauseV3EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessagePauseV3DataSchema,
});

function mapMessagePauseV3(args: unknown) {
  const result = args as utils.Result;
  const namedArgs = extractNamedProperties(result);
  namedArgs.data = extractNamedProperties(namedArgs.data);
  namedArgs.data.signature = extractNamedProperties(namedArgs.data.signature);
  namedArgs.data.app = extractNamedProperties(namedArgs.data.app);

  return MessagePauseV3EventSchema.parse(namedArgs);
}

// 4. MessagePingV1
const MessagePingV1DataSchema = z.object({
  blockNumber: BigNumberSchema,
  app: AppSchema,
});

const MessagePingV1EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessagePingV1DataSchema,
});

function mapMessagePingV1(args: unknown) {
  const result = args as utils.Result;
  const namedArgs = extractNamedProperties(result);
  namedArgs.data = extractNamedProperties(namedArgs.data);
  namedArgs.data.app = extractNamedProperties(namedArgs.data.app);

  return MessagePingV1EventSchema.parse(namedArgs);
}

// 5. MessageUnvetV1
const MessageUnvetV1DataSchema = z.object({
  blockNumber: BigNumberSchema,
  blockHash: z.string(),
  stakingModuleId: BigNumberSchema,
  nonce: BigNumberSchema,
  operatorIds: z.string(),
  vettedKeysByOperator: z.string(),
  signature: SignatureSchema,
  app: AppSchema,
});

const MessageUnvetV1EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessageUnvetV1DataSchema,
});

function mapMessageUnvetV1(args: unknown) {
  const result = args as utils.Result;
  const namedArgs = extractNamedProperties(result);
  namedArgs.data = extractNamedProperties(namedArgs.data);
  namedArgs.data.signature = extractNamedProperties(namedArgs.data.signature);
  namedArgs.data.app = extractNamedProperties(namedArgs.data.app);

  return MessageUnvetV1EventSchema.parse(namedArgs);
}

export const eventMappers: { [eventName: string]: (args: unknown) => any } = {
  MessageDepositV1: mapMessageDepositV1,
  MessagePauseV2: mapMessagePauseV2,
  MessagePauseV3: mapMessagePauseV3,
  MessagePingV1: mapMessagePingV1,
  MessageUnvetV1: mapMessageUnvetV1,
};

export type MessageDepositV1Event = z.infer<typeof MessageDepositV1EventSchema>;
export type MessagePauseV2Event = z.infer<typeof MessagePauseV2EventSchema>;
export type MessagePauseV3Event = z.infer<typeof MessagePauseV3EventSchema>;
export type MessagePingV1Event = z.infer<typeof MessagePingV1EventSchema>;
export type MessageUnvetV1Event = z.infer<typeof MessageUnvetV1EventSchema>;

export type EventDataMap = {
  MessageDepositV1: MessageDepositV1Event;
  MessagePauseV2: MessagePauseV2Event;
  MessagePauseV3: MessagePauseV3Event;
  MessagePingV1: MessagePingV1Event;
  MessageUnvetV1: MessageUnvetV1Event;
};

export type MessageDepositV1 = MessageDepositV1Event['data'];
export type MessagePauseV2 = MessagePauseV2Event['data'];
export type MessagePauseV3 = MessagePauseV3Event['data'];
export type MessagePingV1 = MessagePingV1Event['data'];
export type MessageUnvetV1 = MessageUnvetV1Event['data'];

export type MessagesDataMap = {
  MessagePingV1: MessagePingV1;
  MessageDepositV1: MessageDepositV1;
  MessageUnvetV1: MessageUnvetV1;
  MessagePauseV2: MessagePauseV2;
  MessagePauseV3: MessagePauseV3;
};

export type MessagesTypes = MessagesDataMap[keyof MessagesDataMap];

export type MessagesNames = keyof MessagesDataMap;
