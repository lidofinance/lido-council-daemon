import StompClient from './stomp.client';
import { TransportInterface } from '../transport.interface';
import { implementationOf } from '../../common/di/decorators/implementationOf';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Injectable()
@implementationOf(TransportInterface)
export default class StompTransport implements TransportInterface {
  public constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private client: StompClient,
  ) {
    try {
      this.client.connect();
      this.logger.log('Client connected to rabbit.', 'StompTransport');
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  public async publish<T>(
    topic: string,
    message: T,
    messageType: string,
  ): Promise<void> {
    const destination = `/exchange/${topic}/${messageType}`;
    await this.client.send(destination, {}, JSON.stringify(message));
  }

  public async subscribe<T>(
    topic: string,
    messageType: string,
    cb: (message: T) => Promise<void>,
  ): Promise<void> {
    const destination = `/exhcange/${topic}/${messageType}`;
    this.client.subscribe(destination, cb);
  }
}
