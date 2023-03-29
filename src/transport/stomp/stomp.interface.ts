import { LoggerService } from '@nestjs/common';
import { StompFrame } from './stomp.frame';
import { WebSocketMock } from './stomp.mock';
import { WebSocket } from 'ws';

export type ConnectCallback = (frame: StompFrame) => void;
export type ErrorCallback = (frame: StompFrame) => void;
export type GetWebSocket = (url: string) => WebSocket | WebSocketMock;

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
