import { z } from 'zod';
import { BigNumber, utils } from 'ethers';

// Common schemas
const BigNumberSchema = z
  .union([z.instanceof(BigNumber), z.string(), z.number()])
  .transform((bn) =>
    BigNumber.isBigNumber(bn) ? bn.toNumber() : bn.toString(),
  );

/**
 * The EIP-2098 compact pair, which is what `Signature { bytes32 r; bytes32 vs; }`
 * in DSM v4 takes. Carried by the v1/v3 events.
 */
const SignatureSchema = z.object({
  r: z.string(),
  vs: z.string(),
});

/**
 * One opaque blob: 65 bytes, `r || s || v`. Carried by the v2/v4 events.
 *
 * DSM v5 takes `GuardianSignature { address guardian; bytes signature; }` and
 * forwards the blob to the guardian's ERC-1271 `isValidSignature` byte for byte.
 * That guardian is an EDF DelegationContract on OpenZeppelin 5.x, whose `ECDSA`
 * accepts this layout only and rejects the compact pair, so a v5 message has to
 * publish the blob for a relayer to be able to forward what it reads.
 */
const SignatureBlobSchema = z.string();

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

// 2. MessagePauseV3
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

// 3. MessagePingV1 — carries no signature, so it is shared by every DSM version
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

// 4. MessageUnvetV1
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

// --- DSM v5: same payloads, signature as the DSM-ready blob ---

const MessageDepositV2DataSchema = MessageDepositV1DataSchema.extend({
  signature: SignatureBlobSchema,
});

const MessageDepositV2EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessageDepositV2DataSchema,
});

const MessagePauseV4DataSchema = MessagePauseV3DataSchema.extend({
  signature: SignatureBlobSchema,
});

const MessagePauseV4EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessagePauseV4DataSchema,
});

const MessageUnvetV2DataSchema = MessageUnvetV1DataSchema.extend({
  signature: SignatureBlobSchema,
});

const MessageUnvetV2EventSchema = z.object({
  guardianAddress: z.string(),
  data: MessageUnvetV2DataSchema,
});

/** A flat signature needs no unwrapping, unlike the compact pair. */
function mapBlobSignatureEvent<Schema extends z.ZodTypeAny>(schema: Schema) {
  return (args: unknown) => {
    const result = args as utils.Result;
    const namedArgs = extractNamedProperties(result);
    namedArgs.data = extractNamedProperties(namedArgs.data);
    namedArgs.data.app = extractNamedProperties(namedArgs.data.app);

    return schema.parse(namedArgs);
  };
}

export const eventMappers: { [eventName: string]: (args: unknown) => any } = {
  MessageDepositV1: mapMessageDepositV1,
  MessagePauseV3: mapMessagePauseV3,
  MessagePingV1: mapMessagePingV1,
  MessageUnvetV1: mapMessageUnvetV1,
  MessageDepositV2: mapBlobSignatureEvent(MessageDepositV2EventSchema),
  MessagePauseV4: mapBlobSignatureEvent(MessagePauseV4EventSchema),
  MessageUnvetV2: mapBlobSignatureEvent(MessageUnvetV2EventSchema),
};

export type MessageDepositV1Event = z.infer<typeof MessageDepositV1EventSchema>;
export type MessagePauseV3Event = z.infer<typeof MessagePauseV3EventSchema>;
export type MessagePingV1Event = z.infer<typeof MessagePingV1EventSchema>;
export type MessageUnvetV1Event = z.infer<typeof MessageUnvetV1EventSchema>;
export type MessageDepositV2Event = z.infer<typeof MessageDepositV2EventSchema>;
export type MessagePauseV4Event = z.infer<typeof MessagePauseV4EventSchema>;
export type MessageUnvetV2Event = z.infer<typeof MessageUnvetV2EventSchema>;

export type EventDataMap = {
  MessageDepositV1: MessageDepositV1Event;
  MessagePauseV3: MessagePauseV3Event;
  MessagePingV1: MessagePingV1Event;
  MessageUnvetV1: MessageUnvetV1Event;
  MessageDepositV2: MessageDepositV2Event;
  MessagePauseV4: MessagePauseV4Event;
  MessageUnvetV2: MessageUnvetV2Event;
};

export type MessageDepositV1 = MessageDepositV1Event['data'];
export type MessagePauseV3 = MessagePauseV3Event['data'];
export type MessagePingV1 = MessagePingV1Event['data'];
export type MessageUnvetV1 = MessageUnvetV1Event['data'];
export type MessageDepositV2 = MessageDepositV2Event['data'];
export type MessagePauseV4 = MessagePauseV4Event['data'];
export type MessageUnvetV2 = MessageUnvetV2Event['data'];

export type MessagesDataMap = {
  MessagePingV1: MessagePingV1;
  MessageDepositV1: MessageDepositV1;
  MessageUnvetV1: MessageUnvetV1;
  MessagePauseV3: MessagePauseV3;
  MessageDepositV2: MessageDepositV2;
  MessagePauseV4: MessagePauseV4;
  MessageUnvetV2: MessageUnvetV2;
};

export type MessagesTypes = MessagesDataMap[keyof MessagesDataMap];

export type MessagesNames = keyof MessagesDataMap;
