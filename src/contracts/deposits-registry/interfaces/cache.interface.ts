import { VerifiedDepositEvent } from './event.interface';

export interface VerifiedDepositEventsCacheHeaders {
  startBlock: number;
  endBlock: number;
}

export interface VerifiedDepositEventsCache {
  headers: VerifiedDepositEventsCacheHeaders;
  data: VerifiedDepositEvent[];
  lastValidEvent?: VerifiedDepositEvent;
}
