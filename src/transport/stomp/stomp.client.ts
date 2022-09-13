import { StompFrame, StompFrameException } from './stomp.frame';
import { sleep } from '../../utils';
import { TimeoutError } from '@nestjs/terminus';
import { LinearBackoff, WebsocketBuilder } from 'websocket-ts';
import WebSocket from 'ws';

// https://stomp.github.io/stomp-specification-1.1.html#Overview
const VERSIONS = '1.0,1.1';

(global as any).WebSocket = require('ws');
(global as any).CustomEvent = Error;

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
  ) {
    this.ws = new WebsocketBuilder(url)
      .onOpen((w, ev) => this.onOpen(w, ev))
      .onMessage((w, ev) => this.onMessage(w, ev))
      .onClose((w, ev) => this.onClose(w, ev))
      .onError((w, ev) => this.onError(w, ev))
      .withBackoff(new LinearBackoff(0, 1000, 8000))
      .build();
  }

  private async transmit(command, headers, body = '') {
    const msg = StompFrame.marshall(command, headers, body);
    await this.ws.send(msg);
  }

  private onOpen(instance, event) {
    this.opened = true;
  }

  private onClose(instance, event) {
    // Lost connection log.
    this.cleanUp();
  }

  private cleanUp() {
    this.connected = false;
  }

  private onError(instance, event) {
    // Log error
  }

  public async connect(headers = {}, timeout = 10000) {
    await this._connect(timeout);

    headers['host'] = this.url;
    headers['accept-version'] = VERSIONS;
    headers['heart-beat'] = '10000,10000';

    if (this.login != null) {
      headers['login'] = this.login;
    }

    if (this.passcode != null) {
      headers['passcode'] = this.passcode;
    }

    this.transmit('CONNECT', headers);
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

  public disconnect(headers: Record<string, string> = {}) {
    this.transmit('DISCONNECT', headers);

    this.ws.close();
    this.cleanUp();
  }

  public send(
    destination: string,
    headers: Record<string, string> = {},
    body = '',
  ) {
    headers['destination'] = destination;
    return this.transmit('SEND', headers, body);
  }

  public subscribe(
    destination: string,
    callback: (message) => Promise<void>,
    headers: Record<string, string> = {},
  ): string {
    if (!('id' in headers)) {
      headers['id'] = `sub-${this.counter}`;
      this.counter += 1;
    }

    headers['destination'] = destination;
    this.subscriptions[headers['id']] = callback;

    this.transmit('SUBSCRIBE', headers);

    return headers['id'];
  }

  public unsubscribe(subscriptionId: string): void {
    delete this.subscriptions[subscriptionId];
    this.transmit('UNSUBSCRIBE', { id: subscriptionId });
  }

  private acknowledged(
    acknowledgedType: 'ACK' | 'NACK',
    messageId: string,
    subscriptionId: string,
    headers: Record<string, string> = {},
  ): void {
    headers['message-id'] = messageId;
    headers['subscription'] = subscriptionId;
    this.transmit(acknowledgedType, headers);
  }

  private onMessage(instance, event): void {
    let frame: StompFrame;

    try {
      frame = StompFrame.unmarshallSingle(event.data);
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

        const ack = (headers: Record<string, string> = {}) => {
          this.acknowledged('ACK', messageId, subscription, headers);
        };
        const nack = (headers: Record<string, string> = {}) => {
          this.acknowledged('NACK', messageId, subscription, headers);
        };

        frame.ack = ack;
        frame.nack = nack;

        onReceive(frame);
      } else {
        // Log that messages are unhandled;
      }
    } else if (frame.command == 'RECEIPT') {
    } else if (frame.command == 'ERROR') {
      this.errorCallback(frame);
    } else {
      // log unexpected frame command
    }
  }
}
