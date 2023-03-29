import { StompFrame } from './stomp.frame';
import { sleep } from '../../utils';
import { TimeoutError } from '@nestjs/terminus';
import { WebSocket } from 'ws';
import { StompFrameException } from './stomp.exceptions';
import { LoggerService } from '@nestjs/common';
import { WebSocketMock } from './stomp.mock';
import {
  ConnectCallback,
  GetWebSocket,
  ErrorCallback,
  StompDependencies,
  StompOptions,
} from './stomp.interface';

// https://stomp.github.io/stomp-specification-1.1.html#Overview
const VERSIONS = '1.0,1.1';

export default class StompClient {
  private ws!: WebSocket | WebSocketMock;

  private opened = false;
  private connected = false;
  private connectionPromise: Promise<void> | null = null;
  private counter = 0;
  private subscriptions: Record<string, (frame: StompFrame) => void> = {};

  private url: string;
  private login: string | null;
  private passcode: string | null;
  private connectCallback: ConnectCallback;
  private errorCallback: ErrorCallback;
  private getWebSocket: GetWebSocket;
  private logger?: LoggerService;
  private options: StompOptions;

  public constructor({
    url,
    login = null,
    passcode = null,
    connectCallback = (frame: StompFrame | boolean) => frame,
    errorCallback = (frame) => frame,
    getWebSocket = (url) => new WebSocket(url),
    logger,
    options,
  }: StompDependencies) {
    this.url = url;
    this.login = login;
    this.passcode = passcode;
    this.connectCallback = connectCallback;
    this.errorCallback = errorCallback;
    this.getWebSocket = getWebSocket;

    this.logger = logger;
    this.options = options;
  }

  public isConnected() {
    return this.connected;
  }

  public isOpened() {
    return this.opened;
  }

  public getConnectionPromise() {
    return this.connectionPromise;
  }

  private createWebSocket(url) {
    const ws: WebSocket | WebSocketMock = this.getWebSocket(url);
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
      this.ws.send(msg.toString(), (error?: Error | undefined) =>
        error ? rej(error) : res(null),
      );
    });
  }

  private onOpen() {
    this.opened = true;
  }

  private async onClose(code: number, reason: Buffer) {
    if (this.connectionPromise) return;
    const closeReasonMessage = reason.toString();

    this.logger?.warn('WS connection is closed', {
      code,
      closeReasonMessage,
    });

    this.cleanUp();

    const isClosedNormally = code === 1000;
    if (isClosedNormally) return;
    try {
      await this.reconnect();
    } catch (error) {
      this.logger?.error('reconnect ws error', (error as Error).message);
    }
  }

  private async onError(error: Error) {
    if (this.connectionPromise) return;
    this.logger?.warn('WS connection error', { error });
    try {
      await this.reconnect();
    } catch (error) {
      this.logger?.error('reconnect ws error', (error as Error).message);
    }
  }

  private async connectWithRetry(attempt = 1) {
    try {
      const { maxWaitSocketSession, webSocketConnectTimeout = 10_000 } =
        this.options;

      this.ws = this.createWebSocket(this.url);
      await this.waitWsConnection(webSocketConnectTimeout);

      const headers = {};
      headers['host'] = '/';
      headers['accept-version'] = VERSIONS;
      headers['heart-beat'] = `${maxWaitSocketSession},${maxWaitSocketSession}`;

      if (this.login != null) {
        headers['login'] = this.login;
      }

      if (this.passcode != null) {
        headers['passcode'] = this.passcode;
      }

      await this.transmit('CONNECT', headers);
      this.connectionPromise = null;
    } catch (error) {
      const err = error as Error;
      if (attempt >= this.options.reconnectAttempts) {
        err['reconnectAttempts'] = attempt;
        this.connectionPromise = null;
        throw error;
      }
      attempt += 1;
      this.logger?.log('WS connection is reconnecting', { attempt });
      this.cleanUp();
      await sleep(this.options.reconnectTimeout);
      await this.connectWithRetry(attempt);
    }
  }

  private async reconnect() {
    if (this.connectionPromise) return await this.connectionPromise;

    this.logger?.log('WS connection is reconnecting', { attempt: 1 });
    this.cleanUp();
    this.connectionPromise = this.connectWithRetry();
    return await this.connectionPromise;
  }

  public async connect() {
    if (this.connectionPromise) return await this.connectionPromise;

    this.connectionPromise = this.connectWithRetry();
    return await this.connectionPromise;
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

  private async waitWsConnection(timeout: number) {
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
    if (!this.opened || !this.connected) {
      await this.reconnect();
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
      // TODO
      this.errorCallback(frame);
    }
  }
}
