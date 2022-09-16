import RabbitClient from './rabbit.client';
import { TransportInterface } from '../transport.interface';
import { implementationOf } from '../../common/di/decorators/implementationOf';
import {
  Inject,
  Injectable,
  LoggerService, NotImplementedException,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { MessageType } from '../../messages';

@Injectable()
@implementationOf(TransportInterface)
export default class RabbitTransport implements TransportInterface {
  public constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private client: RabbitClient,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public async disconnect(): Promise<void> {}

  public async publish<T>(
    topic: string,
    message: T,
    messageType: MessageType,
  ): Promise<void> {
    await this.client.publish(topic, JSON.stringify(message), messageType);
  }

  public async subscribe<T>(
    topic: string,
    messageType: string,
    cb: (message: T) => Promise<void>,
  ): Promise<void> {
    throw new NotImplementedException('To read messages use RabbitClient.get');
  }
}
