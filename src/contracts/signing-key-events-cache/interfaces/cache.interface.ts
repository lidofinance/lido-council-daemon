import { SigningKeyEvent } from './event.interface';

export interface SigningKeyEventsCacheHeaders {
  startBlock: number;
  endBlock: number;
  version: string;
}

export interface SigningKeyEventsCache {
  headers: SigningKeyEventsCacheHeaders;
  data: SigningKeyEvent[];
}
