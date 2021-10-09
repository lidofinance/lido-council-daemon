import { DepositEventsCache } from './interfaces';

export const DEPOSIT_CACHE_DIR = 'cache';
export const DEPOSIT_CACHE_FILE = 'deposit.events.json';
export const DEPOSIT_CACHE_DEFAULT: DepositEventsCache = Object.freeze({
  startBlock: 0,
  endBlock: 0,
  events: [],
});
