import {
  MessageDeposit,
  MessageRequiredFields,
  MessageType,
  MessageUnvet,
  MessagePauseV2 as OGMessagePauseV2,
  MessagePauseV3 as OGMessagePauseV3,
} from 'messages';
import { DataBusClient } from './data-bus.client';
import {
  MessageDepositV1,
  MessagePauseV3,
  MessagePauseV2,
  MessageUnvetV1,
  MessagePingV1,
  MessagesNames,
} from './message.interface';

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

  constructor(dataBusClient: DataBusClient) {
    this.dataBusClient = dataBusClient;
  }

  async sendMessage(message: MessageRequiredFields & MessageMeta) {
    const outputMessage = this.transformMessage(message);
    const eventName = this.getEventName(message.type, message);

    await this.dataBusClient.sendMessage(eventName, outputMessage);
  }

  private transformMessage(message: MessageRequiredFields & MessageMeta): any {
    const { app } = message;

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

        const output: MessageDepositV1 = {
          blockNumber,
          blockHash,
          depositRoot,
          stakingModuleId,
          nonce,
          signature: {
            r: signature.r,
            vs: signature._vs, // Assuming vs is signature._vs
          },
          app,
        };
        return output;
      }

      case MessageType.PAUSE: {
        if ('depositRoot' in message) {
          // MessagePauseV2
          const { blockNumber, blockHash, signature, stakingModuleId } =
            message as OGMessagePauseV2;

          const output: MessagePauseV2 = {
            blockNumber,
            blockHash,
            signature: {
              r: signature.r,
              vs: signature._vs,
            },
            stakingModuleId,
            app,
          };
          return output;
        } else {
          // MessagePauseV3
          const { blockNumber, signature } = message as OGMessagePauseV3 &
            MessageMeta;

          const output: MessagePauseV3 = {
            blockNumber,
            signature: {
              r: signature.r,
              vs: signature._vs,
            },
            app,
          };
          return output;
        }
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

        const output: MessageUnvetV1 = {
          blockNumber,
          blockHash,
          stakingModuleId,
          nonce,
          operatorIds,
          vettedKeysByOperator,
          signature: {
            r: signature.r,
            vs: signature._vs,
          },
          app,
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

  private getEventName(messageType: MessageType, message): MessagesNames {
    const eventNameMap: Record<MessageType, MessagesNames> = {
      [MessageType.DEPOSIT]: 'MessageDepositV1',
      [MessageType.PAUSE]: 'MessagePauseV3',
      [MessageType.PING]: 'MessagePingV1',
      [MessageType.UNVET]: 'MessageUnvetV1',
    };

    if (messageType === MessageType.PAUSE && message.stakingModuleId) {
      return 'MessagePauseV2';
    }

    return eventNameMap[messageType];
  }
}
