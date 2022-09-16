import { LoggerService } from '@nestjs/common';
import { FetchService } from '@lido-nestjs/fetch';

export default class RabbitClient {
  public constructor(
    private host: string,
    private virtualHost: string = '%2f',
    private login: string | null = null,
    private passcode: string | null = null,
    private logger: LoggerService,
    private fetchService: FetchService,
  ) {
    this.logger.log('Initialize RabbitMQ client.');
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' +
        Buffer.from(this.login + ':' + this.passcode).toString('base64'),
    };
  }

  public async publish(exchange: string, message: string, routingKey: string) {
    this.logger.debug?.('Publish message', { exchange, message, routingKey });

    const publishUrl = new URL(
      `api/exchanges/${this.virtualHost}/${exchange}/publish/`,
      this.host,
    ).href;

    return this.fetchService.fetchJson(publishUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        properties: {},
        routing_key: routingKey,
        payload: message,
        payload_encoding: 'string',
      }),
    });
  }

  public async get(routingKey: string, messagesCount: number) {
    this.logger.debug?.('Receive message', { routingKey, messagesCount });

    const getUrl = new URL(
      `api/queues/${this.virtualHost}/${routingKey}/get/`,
      this.host,
    ).href;

    return fetch(getUrl, {
      method: 'GET',
      headers: this.getHeaders(),
      body: JSON.stringify({
        count: {
          count: messagesCount,
          requeue: false,
          encoding: 'auto',
          truncate: 50000,
        },
      }),
    });
  }
}
