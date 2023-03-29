import { EventEmitter } from 'events';
import { StompFrame } from './stomp.frame';

export class WebSocketMock extends EventEmitter {
  serverEventEmitter: EventEmitter;
  messages: Array<any> = [];
  status: boolean;

  constructor(...args) {
    super(...args);
    setTimeout(() => {
      this.emit('open');
    }, 10);
    this.status = true;
    this.serverEventEmitter = new EventEmitter();
    this.serverEventEmitter.on('message', this.handleClientMessages.bind(this));
  }

  private handleClientMessages(frame: any) {
    if (frame.command === 'CONNECT' && this.status) {
      const packet = StompFrame.marshall('CONNECTED', {});
      this.emit('message', packet);
    }
    if (frame.command === 'CONNECT' && !this.status) {
      // TODO
      const packet = StompFrame.marshall('ERROR', {});
      this.emit('message', packet);
    }
    this.messages.push(frame);
  }

  public send(message, cb: (err?: Error | undefined) => void) {
    const frame = StompFrame.unmarshallSingle(message);
    if (this.status) {
      this.serverEventEmitter.emit('message', frame);
      cb();
    } else {
      cb(new Error('network error'));
    }
  }

  public emitConnectError() {
    const packet = StompFrame.marshall('ERROR', {});
    this.emit('message', packet);
  }

  public getLastMessage() {
    return this.messages.slice(-1)[0];
  }

  public close() {
    return null;
  }

  public closeServer(code: number) {
    this.emit('close', code, 'test');
  }

  public setServerStatus(status: boolean) {
    this.status = status;
  }
}
