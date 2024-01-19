import { Meta } from './Meta';
import { SROperatorListWithModule } from './SROperatorListWithModule';

export type GroupedByModuleOperatorListResponse = {
  /**
   * Staking router module operators with module
   */
  data: SROperatorListWithModule[];
  meta: Meta;
};
