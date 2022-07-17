import { VerifiedDepositEventGroup } from './event.interface';

export interface VerifiedDepositEventsCache extends VerifiedDepositEventGroup {
  version: string;
}
