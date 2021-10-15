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
    private transportService: TransportInterface,
    private config: Configuration,
  ) {}

  public async getMessageTopic(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    const prefix = getMessageTopicPrefix(chainId);
    const topic = this.config.KAFKA_TOPIC;

    return `${prefix}-${topic}`;
  }

  public async sendMessage<T extends MessageRequiredFields>(
    message: T,
  ): Promise<void> {
    const topic = await this.getMessageTopic();
    await this.transportService.publish(topic, message);

    const messageType = message.type;
    this.messageCounter.labels({ messageType }).inc();
  }
}
