import { SRModule } from '.';
import { ELBlockSnapshot } from './ELBlockSnapshot';
import { RegistryKey } from './RegistryKey';

export type SRModuleKeyListResponse = {
  data: {
    keys: Array<RegistryKey>;
    module: SRModule;
  };
  meta: {
    elBlockSnapshot: ELBlockSnapshot;
  };
};
