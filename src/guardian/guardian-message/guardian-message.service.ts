import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  MessageDeposit,
  MessageMeta,
  MessagePause,
  MessageRequiredFields,
  MessagesService,
  MessageType,
} from 'messages';
import { BlockData } from '../interfaces';
import { APP_NAME, APP_VERSION } from 'app.constants';

@Injectable()
export class GuardianMessageService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,
    private messagesService: MessagesService,
  ) {}

  /**
   * Sends a ping message to the message broker
   * @param stakingModuleIds - all staking router ids
   * @param blockData - collected data from the current block
   */
  public async pingMessageBroker(
    stakingModuleIds: number[],
    blockData: BlockData,
  ): Promise<void> {
    const { blockNumber, guardianIndex, guardianAddress } = blockData;

    await this.sendMessageFromGuardian({
      type: MessageType.PING,
      blockNumber,
      guardianIndex,
      guardianAddress,
      stakingModuleIds,
    });
  }

  /**
   * Sends a deposit message to the message broker
   * @param message - MessageDeposit object
   */
  public sendDepositMessage(message: Omit<MessageDeposit, 'type'>) {
    return this.sendMessageFromGuardian({
      ...message,
      type: MessageType.DEPOSIT,
    });
  }

  /**
   * Sends a pause message to the message broker
   * @param message - MessagePause object
   */
  public sendPauseMessage(message: Omit<MessagePause, 'type'>) {
    return this.sendMessageFromGuardian({
      ...message,
      type: MessageType.PAUSE,
    });
  }

  /**
   * Adds information about the app to the message
   * @param message - message object
   * @returns extended message
   */
  public addMessageMetaData<T>(message: T): T & MessageMeta {
    return {
      ...message,
      app: { version: APP_VERSION, name: APP_NAME },
    };
  }

  /**
   * Sends a message to the message broker from the guardian
   * @param messageData - message object
   */
  public async sendMessageFromGuardian<T extends MessageRequiredFields>(
    messageData: T,
  ): Promise<void> {
    if (messageData.guardianIndex == -1) {
      this.logger.warn(
        'Your address is not in the Guardian List. The message will not be sent',
      );
      return;
    }
    const messageWithMeta = this.addMessageMetaData(messageData);
    this.logger.log('Sending a message to broker', messageData);
    await this.messagesService.sendMessage(messageWithMeta);
  }
}
