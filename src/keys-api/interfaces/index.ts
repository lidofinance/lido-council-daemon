import { components } from './generated';

export type SRModuleKeysResponse =
  components['schemas']['SRModuleKeyListResponse'];

export type SRModuleKeys = {
  data: NonNullable<SRModuleKeysResponse['data']>;
  meta: NonNullable<SRModuleKeysResponse['meta']>;
};
export type SRModuleListResponse =
  components['schemas']['SRModuleListResponse'];

export type SRModule = components['schemas']['StakingModuleResponse'];
