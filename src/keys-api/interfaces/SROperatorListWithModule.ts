import type { RegistryOperator } from './RegistryOperator';
import type { SRModule } from './SRModule';

export type SROperatorListWithModule = {
  /**
   * Operators of staking router module
   */
  operators: Array<RegistryOperator>;
  /**
   * Detailed Staking Router information
   */
  module: SRModule;
};
