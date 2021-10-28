import { NodeOperatorWithKeys } from './operators.interface';

export interface NodeOperatorsCache {
  keysOpIndex: number;
  depositRoot: string;
  operators: NodeOperatorWithKeys[];
}
