import type { ELBlockSnapshot } from './ELBlockSnapshot';
import type { SRModule } from './SRModule';

export type SRModuleListResponse = {
  /**
   * List of staking router modules with detailed information
   */
  data: Array<SRModule>;
  /**
   * Execution layer block information
   */
  elBlockSnapshot: ELBlockSnapshot;
};
