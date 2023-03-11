import type { RegistryKey } from './RegistryKey';
import type { SRModule } from './SRModule';

export type SRKeyListWithModule = {
  /**
   * Keys of staking router module
   */
  keys: Array<RegistryKey>;
  /**
   * Detailed Staking Router information
   */
  module: SRModule;
};
