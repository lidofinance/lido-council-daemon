import { SRModule } from '.';
import { ELBlockSnapshot } from './ELBlockSnapshot';

export type SRModuleListResponse = {
  data: Array<SRModule>;
  elBlockSnapshot: ELBlockSnapshot;
};
