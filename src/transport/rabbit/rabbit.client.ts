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
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.login && this.passcode) {
      headers['Authorization'] =
        'Basic ' +
        Buffer.from(this.login + ':' + this.passcode).toString('base64');
    }

    return headers;
  }

  public async createQueue(queueName: string) {
    const getUrl = new URL(
      `api/queues/${this.virtualHost}/${queueName}/`,
      this.host,
    );

    return this.fetchService.fetchText(getUrl.href, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        auto_delete: false,
        durable: true,
        arguments: {},
      }),
    });
  }

  public async bindQueueToExchange(queueName: string, exchangeName: string) {
    const getUrl = new URL(
      `api/bindings/${this.virtualHost}/e/${exchangeName}/q/${queueName}/`,
      this.host,
    );

    return this.fetchService.fetchText(getUrl.href, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        routing_key: queueName,
        arguments: {},
      }),
    });
  }

  public async publish<T>(
    exchange: string,
    message: string,
    routingKey: string,
  ): Promise<T> {
    this.logger.debug?.('Publish message', { exchange, message, routingKey });

    const publishUrl = new URL(
      `/api/exchanges/${this.virtualHost}/${exchange}/publish/`,
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

  public async get(
    routingKey: string,
    messagesCount: number,
  ): Promise<Record<any, any>[]> {
    this.logger.debug?.('Receive message', { routingKey, messagesCount });

    const getUrl = new URL(
      `api/queues/${this.virtualHost}/${routingKey}/get/`,
      this.host,
    );

    return this.fetchService.fetchJson(getUrl.href, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        count: messagesCount,
        requeue: false,
        encoding: 'auto',
        truncate: 50000,
        ackmode: 'ack_requeue_false',
      }),
    });
  }
}
