import StompClient from './stomp.client';
import { TransportInterface } from '../transport.interface';
import { implementationOf } from '../../common/di/decorators/implementationOf';
import { Injectable } from '@nestjs/common';

export class StompClientNoConnectionException extends Error {}

@Injectable()
@implementationOf(TransportInterface)
export default class StompTransport implements TransportInterface {
  public constructor(private client: StompClient) {
    this.client.connect();
  }

  public async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  private checkConnection() {
    if (!this.client.opened) {
      throw new StompClientNoConnectionException(
        'STOMP client is not connected.',
      );
    }
  }

  public async publish<T>(
    topic: string,
    message: T,
    messageType: string,
  ): Promise<void> {
    this.checkConnection();

    const destination = `/exchange/${topic}/${messageType}`;
    await this.client.send(destination, {}, JSON.stringify(message));
  }

  public async subscribe<T>(
    topic: string,
    messageType: string,
    cb: (message: T) => Promise<void>,
  ): Promise<void> {
    this.checkConnection();

    const destination = `/exchange/${topic}/${messageType}`;
    this.client.subscribe(destination, (frame) => {
      cb(JSON.parse(frame.body));
    });
  }
}
