import { NodeOperatorWithKeys } from './operators.interface';

export interface NodeOperatorsCache {
  version: string;
  keysOpIndex: number;
  depositRoot: string;
  operators: NodeOperatorWithKeys[];
}
