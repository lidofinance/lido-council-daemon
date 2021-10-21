import { BigNumber } from '@ethersproject/bignumber';

export interface NodeOperator {
  active: boolean;
  name: string;
  rewardAddress: string;
  stakingLimit: BigNumber;
  stoppedValidators: BigNumber;
  totalSigningKeys: BigNumber;
  usedSigningKeys: BigNumber;
}
