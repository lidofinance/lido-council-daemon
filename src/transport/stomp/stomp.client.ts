import { StompFrame } from './stomp.frame';
import { sleep } from '../../utils';
import { TimeoutError } from '@nestjs/terminus';
import { WebSocket } from 'ws';
import { StompFrameException } from './stomp.exceptions';
import { LoggerService } from '@nestjs/common';

// https://stomp.github.io/stomp-specification-1.1.html#Overview
const VERSIONS = '1.0,1.1';
const STOMP_DIED_ERROR = 'STOMP died';

export default class StompClient {
  private ws: WebSocket;

  private opened = false;
  private connected = false;
  private counter = 0;
  private subscriptions: Record<string, (frame: StompFrame) => void> = {};

  public constructor(
    private url: string,
    private login: string | null = null,
    private passcode: string | null = null,
    private connectCallback: (frame: StompFrame) => void = (
      frame: StompFrame | boolean,
    ) => frame,
    private errorCallback: (frame: StompFrame) => void = (frame) => frame,
    private logger?: LoggerService,
  ) {
    this.ws = this.createWebSocket(url);
  }

  private createWebSocket(url) {
    const ws: WebSocket = new WebSocket(url);
    ws.on('open', this.onOpen.bind(this));
    ws.on('message', this.onMessage.bind(this));
    ws.on('close', this.onClose.bind(this));
    ws.on('error', this.onError.bind(this));
    return ws;
  }

  private async transmit(
    command: string,
    headers: Record<string, string>,
    body = '',
  ) {
    const msg = StompFrame.marshall(command, headers, body);
    return new Promise((res, rej) => {
      this.ws.send(msg.toString(), (error) => (error ? rej(error) : res(null)));
    });
  }

  private onOpen() {
    this.opened = true;
  }

  private async onClose(code: number, reason: Buffer) {
    const closeReasonMessage = reason.toString();
    // check code and closeReasonMessage because we have a case
    // with 1000 and closeReasonMessage as STOMP_DIED_ERROR
    // and we need to reconnect in this case
    if (closeReasonMessage === STOMP_DIED_ERROR) {
      this.logger?.log('WS connection is closed', { code, closeReasonMessage });
    } else {
      this.logger?.warn('WS connection is closed', {
        code,
        closeReasonMessage,
      });
    }
    const isClosedNormally =
      code === 1000 && closeReasonMessage !== STOMP_DIED_ERROR;
    if (isClosedNormally) return;

    await this.reconnect();
  }

  private async onError(error: Error) {
    this.logger?.warn('WS connection error', { error });
    await this.reconnect();
  }

  private async reconnect() {
    this.logger?.warn('WS connection is reconnecting');

    this.cleanUp();
    await sleep(10000);

    try {
      this.ws = this.createWebSocket(this.url);
      await this.connect();
    } catch (error) {
      await this.reconnect();
    }
  }

  private cleanUp() {
    this.connected = false;
    this.opened = false;
    try {
      this.ws.close();
    } catch (error) {
      this.logger?.error('Socket closing error', error);
    }
  }

  public async connect(headers = {}, timeout = 10000) {
    await this._connect(timeout);

    headers['host'] = '/';
    headers['accept-version'] = VERSIONS;
    headers['heart-beat'] = '10000,10000';

    if (this.login != null) {
      headers['login'] = this.login;
    }

    if (this.passcode != null) {
      headers['passcode'] = this.passcode;
    }

    await this.transmit('CONNECT', headers);
  }

  private async _connect(timeout: number) {
    let totalPassed = 0;

    while (!this.opened) {
      await sleep(250);
      totalPassed += 250;

      if (timeout < totalPassed) {
        throw new TimeoutError(timeout, 'Websocket connection timeout.');
      }
    }
  }

  public async disconnect(headers: Record<string, string> = {}) {
    await this.transmit('DISCONNECT', headers);
    this.cleanUp();
  }

  public async send(
    destination: string,
    headers: Record<string, string> = {},
    body = '',
  ) {
    while (!this.opened || !this.connected) {
      await sleep(1000);
    }
    headers['destination'] = destination;
    return await this.transmit('SEND', headers, body);
  }

  public async subscribe(
    destination: string,
    callback: (frame: StompFrame) => void,
    headers: Record<string, string> = {},
  ) {
    if (!('id' in headers)) {
      headers['id'] = `sub-${this.counter}`;
      this.counter += 1;
    }

    headers['destination'] = destination;
    this.subscriptions[headers['id']] = callback;

    await this.transmit('SUBSCRIBE', headers);

    return headers['id'];
  }

  public async unsubscribe(subscriptionId: string) {
    delete this.subscriptions[subscriptionId];
    await this.transmit('UNSUBSCRIBE', { id: subscriptionId });
  }

  private async acknowledged(
    acknowledgedType: 'ACK' | 'NACK',
    messageId: string,
    subscriptionId: string,
    headers: Record<string, string> = {},
  ) {
    headers['message-id'] = messageId;
    headers['subscription'] = subscriptionId;
    await this.transmit(acknowledgedType, headers);
  }

  private onMessage(event): void {
    let frame: StompFrame;

    try {
      frame = StompFrame.unmarshallSingle(event.toString());
    } catch (e) {
      if (!(e instanceof StompFrameException)) {
        throw e;
      }
      return;
    }

    if (frame.command == 'CONNECTED') {
      this.connected = true;
      this.connectCallback(frame);
    } else if (frame.command == 'MESSAGE') {
      const subscription = frame.headers['subscription'];

      if (subscription in this.subscriptions) {
        const onReceive = this.subscriptions[subscription];
        const messageId = frame.headers['message-id'];

        const ack = async (headers: Record<string, string> = {}) => {
          await this.acknowledged('ACK', messageId, subscription, headers);
        };
        const nack = async (headers: Record<string, string> = {}) => {
          await this.acknowledged('NACK', messageId, subscription, headers);
        };

        frame.ack = ack;
        frame.nack = nack;

        onReceive(frame);
      }
    } else if (frame.command == 'RECEIPT') {
    } else if (frame.command == 'ERROR') {
      this.errorCallback(frame);
    }
  }
}
