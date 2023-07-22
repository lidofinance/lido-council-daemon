import { VerifiedDepositEvent } from './event.interface';

export interface VerifiedDepositEventsCacheHeaders {
  startBlock: number;
  endBlock: number;
  version: string;
}

export interface VerifiedDepositEventsCache {
  headers: VerifiedDepositEventsCacheHeaders;
  data: VerifiedDepositEvent[];
}
