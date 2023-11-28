export type RegistryOperator = {
  /**
   * Index of Operator
   */
  index: number;
  /**
   * This value shows if node operator active
   */
  active: boolean;
  /**
   * Operator name
   */
  name: string;
  /**
   * Ethereum 1 address which receives stETH rewards for this operator
   */
  rewardAddress: string;
  /**
   * The number of keys vetted by the DAO and that can be used for the deposit
   */
  stakingLimit: number;
  /**
   * Amount of stopped validators
   */
  stoppedValidators: number;
  /**
   * Total signing keys amount
   */
  totalSigningKeys: number;
  /**
   * Amount of used signing keys
   */
  usedSigningKeys: number;
  /**
   * Staking module address
   */
  moduleAddress: string;
};
