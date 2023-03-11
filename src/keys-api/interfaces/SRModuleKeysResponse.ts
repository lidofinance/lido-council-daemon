import type { Meta } from './Meta';
import type { SRKeyListWithModule } from './SRKeyListWithModule';

export type SRModuleKeysResponse = {
  /**
   * Staking router module keys.
   */
  data: SRKeyListWithModule;
  meta: Meta;
};
