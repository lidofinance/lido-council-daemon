import type { Meta } from './Meta';
import { RegistryKey } from './RegistryKey';

export type KeyListResponse = {
  data: Array<RegistryKey>;
  meta: Meta;
};
