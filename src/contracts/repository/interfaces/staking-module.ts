import { CsmAbi, SigningKeyAbi } from 'generated';

export interface StakingModule {
  impl: SigningKeyAbi | CsmAbi;
}
