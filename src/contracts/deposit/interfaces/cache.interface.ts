import * as z from 'zod';
import { VerifiedDepositEvent } from './event.interface';

export const VerifiedDepositEventsCacheHeaders = z.object({
  startBlock: z.number().min(0),
  endBlock: z.number().min(0),
  version: z.string(),
});

export type VerifiedDepositEventsCacheHeaders = z.TypeOf<
  typeof VerifiedDepositEventsCacheHeaders
>;

export const VerifiedDepositEventsCache = z.object({
  headers: VerifiedDepositEventsCacheHeaders,
  data: z.array(VerifiedDepositEvent),
});
export type VerifiedDepositEventsCache = z.TypeOf<
  typeof VerifiedDepositEventsCache
>;
