import RabbitClient from './rabbit.client';
import { TransportInterface } from '../transport.interface';
import { implementationOf } from '../../common/di/decorators/implementationOf';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MessageType } from '../../messages';

@Injectable()
@implementationOf(TransportInterface)
export default class RabbitTransport implements TransportInterface {
  private closed = false;

  public constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private client: RabbitClient,
  ) {}

  public async disconnect(): Promise<void> {
    this.closed = true;
  }

  public async publish<T>(
    topic: string,
    message: T,
    messageType: MessageType,
  ): Promise<void> {
    await this.client.publish(topic, JSON.stringify(message), messageType);
  }

  public async subscribe(
    topic: string,
    messageType: MessageType,
    cb: (message) => Promise<void>,
  ): Promise<void> {
    while (!this.closed) {
      const message = await this.client.get(messageType, 1);
      if (message.length) {
        await cb(JSON.parse(message[0]['payload']));
      } else {
        await setTimeout(() => this.subscribe(topic, messageType, cb), 1000);
      }
    }
  }
}
