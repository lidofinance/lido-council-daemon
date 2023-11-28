import { Injectable } from '@nestjs/common';
import { ProviderService } from 'provider';
import { TransportInterface } from 'transport';
import { getMessageTopicPrefix } from './messages.constants';
import { Configuration } from 'common/config';
import { METRIC_SENT_MESSAGES } from 'common/prometheus';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { MessageRequiredFields } from './interfaces';

@Injectable()
export class MessagesService {
  constructor(
    @InjectMetric(METRIC_SENT_MESSAGES) public messageCounter: Counter<string>,
    private providerService: ProviderService,
    // private transportService: TransportInterface,
    private config: Configuration,
  ) {}

  /**
   * Gets a message topic for the current chain
   * @returns message topic
   */
  public async getMessageTopic(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    const prefix = getMessageTopicPrefix(chainId);
    const topic = this.config.BROKER_TOPIC;

    return `${prefix}-${topic}`;
  }

  /**
   * Sends a message to a message broker
   */
  public async sendMessage<T extends MessageRequiredFields>(
    message: T,
  ): Promise<void> {
    const topic = await this.getMessageTopic();
    const messageType = message.type;

    // await this.transportService.publish(topic, message, messageType);

    this.messageCounter.labels({ messageType }).inc();
  }
}
