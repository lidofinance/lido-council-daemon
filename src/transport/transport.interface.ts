import { createInterface } from 'common/di/functions/createInterface';
import { MessageType } from '../messages';

export const TransportInterface =
  createInterface<TransportInterface>('TransportInterface');

export interface TransportInterface {
  publish<T>(
    topic: string,
    message: T,
    messageType: MessageType,
  ): Promise<void>;
  subscribe<T>(
    topic: string,
    messageType: MessageType,
    cb: (message: T) => Promise<void>,
  ): Promise<void>;
  disconnect(): Promise<void>;
}
