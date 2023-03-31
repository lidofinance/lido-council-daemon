import { LoggerService } from '@nestjs/common';
import { StompFrame } from './stomp.frame';

export interface WebSocketServer {
  on(type: 'open', cb: () => void);
  on(type: 'message', cb: (message: any) => void);
  on(type: 'close', cb: (code: number, reason: Buffer) => void);
  on(type: 'error', cb: (error: Error) => void);
  close: () => void;
  send: (message: string, cb: (error?: Error | undefined) => void) => void;
}

export type ConnectCallback = (frame: StompFrame) => void;
export type ErrorCallback = (frame: StompFrame) => void;
export type GetWebSocket = (url: string) => WebSocketServer;

export type StompOptions = {
  reconnectTimeout: number;
  reconnectAttempts: number;
  maxWaitSocketSession: number;
  webSocketConnectTimeout?: number;
};

export interface StompDependencies {
  url: string;
  login: string | null;
  passcode: string | null;
  connectCallback: ConnectCallback;
  errorCallback: ErrorCallback;
  getWebSocket?: GetWebSocket;
  logger?: LoggerService;
  options: StompOptions;
}
