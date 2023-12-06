import * as z from 'zod';

export const DepositEvent = z.object({
  pubkey: z.string(),
  wc: z.string(),
  amount: z.string(),
  signature: z.string(),
  tx: z.string(),
  blockNumber: z.number(),
  blockHash: z.string(),
});
export type DepositEvent = z.infer<typeof DepositEvent>;

export const Valid = z.object({
  valid: z.boolean(),
});

export const VerifiedDepositEvent = DepositEvent.merge(Valid);
export type VerifiedDepositEvent = z.infer<typeof VerifiedDepositEvent>;

export type DepositEventGroup = {
  events: DepositEvent[];
  startBlock: number;
  endBlock: number;
};

export interface VerifiedDepositEventGroup extends DepositEventGroup {
  events: VerifiedDepositEvent[];
}
