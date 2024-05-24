import { SigningKeyEvent } from './event.interface';

export interface SigningKeyEventsCacheHeaders {
  startBlock: number;
  endBlock: number;
}

export interface SigningKeyEventsCache {
  headers: SigningKeyEventsCacheHeaders;
  data: SigningKeyEvent[];
}
