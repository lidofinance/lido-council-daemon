import { CSM, NOP_REGISTRY, SANDBOX, SIMPLE_DVT } from '../constants';

export const CURATED_ONCHAIN_V1_TYPE = 'curated-onchain-v1';
export const COMMUNITY_ONCHAIN_V1_TYPE = 'community-onchain-v1';

// TODO: read locator from config

export class StakingRouter {
  getStakingModulesAddresses(type: string) {
    if (type == CURATED_ONCHAIN_V1_TYPE)
      return [NOP_REGISTRY, SIMPLE_DVT, SANDBOX];

    if (type == COMMUNITY_ONCHAIN_V1_TYPE) return [CSM];

    return [];
  }
}
