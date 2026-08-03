import { Signature } from '@ethersproject/bytes';
import { formatBytes32String, hexConcat, hexlify } from 'ethers/lib/utils';
import {
  MessageDeposit,
  MessagePauseV3 as OGMessagePauseV3,
  MessageRequiredFields,
  MessageType,
  MessageUnvet,
} from 'messages/interfaces';
import { DataBusClient } from './data-bus.client';
import { Mutex } from './utils';
import {
  MessageDepositV1,
  MessageDepositV2,
  MessagePauseV3,
  MessagePauseV4,
  MessagePingV1,
  MessageUnvetV1,
  MessageUnvetV2,
  MessagesNames,
  MessagesTypes,
} from './data-bus.serializer';

/** DSM v5 is the first version whose guardian verifies through ERC-1271. */
const DSM_CONTRACT_VERSION_5 = 5;

interface MessagePing {
  type: MessageType.PING;
  blockNumber: number;
  guardianIndex: number;
  guardianAddress: string;
}

type MessageMeta = {
  app: { version: string };
};

/** The EIP-2098 compact pair `Signature { bytes32 r; bytes32 vs; }` in v3/v4. */
function compactSignature(signature: Signature) {
  return { r: signature.r, vs: signature._vs };
}

/**
 * 65 bytes, `r || s || v`. DSM v5 forwards `GuardianSignature.signature` to the
 * guardian's ERC-1271 `isValidSignature` byte for byte, and that guardian is an
 * EDF DelegationContract on OpenZeppelin 5.x, whose `ECDSA` accepts this layout
 * only. Publishing the compact pair on a v5 message would leave every relayer
 * holding bytes the DSM cannot accept.
 */
function signatureBlob(signature: Signature): string {
  return hexConcat([signature.r, signature.s, hexlify(signature.v)]);
}

export class DSMMessageSender {
  private dataBusClient: DataBusClient;
  private mutex: Mutex;
  constructor(dataBusClient: DataBusClient) {
    this.dataBusClient = dataBusClient;
    this.mutex = new Mutex();
  }

  async sendMessage(message: MessageRequiredFields & MessageMeta) {
    const outputMessage = this.transformMessage(message);
    const eventName = this.getEventName(message.type, message);

    try {
      await this.mutex.lock();
      await this.dataBusClient.sendMessage(eventName, outputMessage);
    } finally {
      this.mutex.unlock();
    }
  }

  private isDsmV5(message: MessageRequiredFields): boolean {
    return message.dsmVersion === DSM_CONTRACT_VERSION_5;
  }

  private transformMessage(
    message: MessageRequiredFields & MessageMeta,
  ): MessagesTypes {
    const { app: appMeta } = message;
    const app = { version: formatBytes32String(appMeta.version) };
    const isV5 = this.isDsmV5(message);

    switch (message.type) {
      case MessageType.DEPOSIT: {
        const {
          blockNumber,
          blockHash,
          depositRoot,
          stakingModuleId,
          nonce,
          signature,
        } = message as MessageDeposit & MessageMeta;

        const payload = {
          blockNumber,
          blockHash,
          depositRoot,
          stakingModuleId,
          nonce,
          app,
        };

        if (isV5) {
          const output: MessageDepositV2 = {
            ...payload,
            signature: signatureBlob(signature),
          };
          return output;
        }

        const output: MessageDepositV1 = {
          ...payload,
          signature: compactSignature(signature),
        };
        return output;
      }

      case MessageType.PAUSE: {
        const { blockNumber, blockHash, signature } =
          message as OGMessagePauseV3 & MessageMeta;

        const payload = { blockNumber, blockHash, app };

        if (isV5) {
          const output: MessagePauseV4 = {
            ...payload,
            signature: signatureBlob(signature),
          };
          return output;
        }

        const output: MessagePauseV3 = {
          ...payload,
          signature: compactSignature(signature),
        };
        return output;
      }

      case MessageType.UNVET: {
        const {
          blockNumber,
          blockHash,
          stakingModuleId,
          nonce,
          operatorIds,
          vettedKeysByOperator,
          signature,
        } = message as MessageUnvet & MessageMeta;

        const payload = {
          blockNumber,
          blockHash,
          stakingModuleId,
          nonce,
          operatorIds,
          vettedKeysByOperator,
          app,
        };

        if (isV5) {
          const output: MessageUnvetV2 = {
            ...payload,
            signature: signatureBlob(signature),
          };
          return output;
        }

        const output: MessageUnvetV1 = {
          ...payload,
          signature: compactSignature(signature),
        };
        return output;
      }

      case MessageType.PING: {
        const { blockNumber } = message as MessagePing & MessageMeta;
        const output: MessagePingV1 = {
          blockNumber,
          app,
        };
        return output;
      }

      default:
        throw new Error(`Unsupported message type: ${message.type}`);
    }
  }

  private getEventName(
    messageType: MessageType,
    message: MessageRequiredFields,
  ): MessagesNames {
    // The signature layout is part of the event signature, so each layout hashes
    // to its own topic. The v4 and v5 events therefore coexist on the bus and a
    // consumer never mis-decodes one as the other.
    const eventNameMap: Record<MessageType, MessagesNames> = this.isDsmV5(
      message,
    )
      ? {
          [MessageType.DEPOSIT]: 'MessageDepositV2',
          [MessageType.PAUSE]: 'MessagePauseV4',
          [MessageType.PING]: 'MessagePingV1',
          [MessageType.UNVET]: 'MessageUnvetV2',
        }
      : {
          [MessageType.DEPOSIT]: 'MessageDepositV1',
          [MessageType.PAUSE]: 'MessagePauseV3',
          [MessageType.PING]: 'MessagePingV1',
          [MessageType.UNVET]: 'MessageUnvetV1',
        };

    return eventNameMap[messageType];
  }
}
