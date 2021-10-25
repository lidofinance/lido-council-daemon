import { NodeOperatorsKey } from './keys.interface';

export interface NodeOperator {
  active: boolean;
  name: string;
  rewardAddress: string;
  stakingLimit: number;
  stoppedValidators: number;
  totalSigningKeys: number;
  usedSigningKeys: number;
  id: number;
}

export interface NodeOperatorWithKeys extends NodeOperator {
  keys: NodeOperatorsKey[];
}
