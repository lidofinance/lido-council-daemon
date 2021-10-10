import { createInterface } from '../common/di/functions/createInterface';

export const TransportInterface =
  createInterface<TransportInterface>('TransportInterface');

export interface TransportInterface {
  publish<T>(topic: string, message: T): Promise<void>;
  subscribe<T>(topic: string, cb: (message: T) => Promise<void>): Promise<void>;
}
