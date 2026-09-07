import { formatBytes32String } from 'ethers/lib/utils';
import {
  MessageDeposit,
  MessagePause,
  MessageRequiredFields,
  MessageType,
  MessageUnvet,
} from 'messages/interfaces';
import { getDsmStrategy } from 'contracts/security/dsm-version.strategy';
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

interface MessagePing {
  type: MessageType.PING;
  blockNumber: number;
  guardianIndex: number;
  guardianAddress: string;
}

type MessageMeta = {
  app: { version: string };
};

export class DSMMessageSender {
  private dataBusClient: DataBusClient;
  private mutex: Mutex;
  constructor(dataBusClient: DataBusClient) {
    this.dataBusClient = dataBusClient;
    this.mutex = new Mutex();
  }

  async sendMessage(message: MessageRequiredFields & MessageMeta) {
    const outputMessage = this.transformMessage(message);
    const eventName = this.getEventName(message);

    try {
      await this.mutex.lock();
      await this.dataBusClient.sendMessage(eventName, outputMessage);
    } finally {
      this.mutex.unlock();
    }
  }

  /**
   * The signature layout and the event that carries it are both owned by the
   * DSM version strategy, so this transform never branches on the version.
   */
  private transformMessage(
    message: MessageRequiredFields & MessageMeta,
  ): MessagesTypes {
    const { app: appMeta } = message;
    const app = { version: formatBytes32String(appMeta.version) };
    const strategy = getDsmStrategy(message.dsmVersion);

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

        const output: MessageDepositV1 | MessageDepositV2 = {
          blockNumber,
          blockHash,
          depositRoot,
          stakingModuleId,
          nonce,
          signature: strategy.wireSignature(signature),
          app,
        } as MessageDepositV1 | MessageDepositV2;
        return output;
      }

      case MessageType.PAUSE: {
        const { blockNumber, blockHash, signature } = message as MessagePause &
          MessageMeta;

        const output: MessagePauseV3 | MessagePauseV4 = {
          blockNumber,
          blockHash,
          signature: strategy.wireSignature(signature),
          app,
        } as MessagePauseV3 | MessagePauseV4;
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

        const output: MessageUnvetV1 | MessageUnvetV2 = {
          blockNumber,
          blockHash,
          stakingModuleId,
          nonce,
          operatorIds,
          vettedKeysByOperator,
          signature: strategy.wireSignature(signature),
          app,
        } as MessageUnvetV1 | MessageUnvetV2;
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

  private getEventName(message: MessageRequiredFields): MessagesNames {
    if (message.type === MessageType.PING) return 'MessagePingV1';

    const busEvents = getDsmStrategy(message.dsmVersion).busEvents;
    const eventByType: Partial<Record<MessageType, MessagesNames>> = {
      [MessageType.DEPOSIT]: busEvents.deposit,
      [MessageType.PAUSE]: busEvents.pause,
      [MessageType.UNVET]: busEvents.unvet,
    };

    const eventName = eventByType[message.type];
    if (!eventName) {
      throw new Error(`Unsupported message type: ${message.type}`);
    }
    return eventName;
  }
}
