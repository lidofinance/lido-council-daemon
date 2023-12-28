export type SRModule = {
  /**
   * Counter that MUST change value if keys were added, removed, node operator was activated/deactivated,  a node operator's ready to deposit keys count is changed
   */
  nonce: number;
  /**
   * type of module
   */
  type: string;
  /**
   * unique id of the module
   */
  id: number;
  /**
   * address of module
   */
  stakingModuleAddress: string;
  /**
   * reward fee of the module
   */
  moduleFee: number;
  /**
   * treasury fee
   */
  treasuryFee: number;
  /**
   * target percent of total keys in protocol, in BP
   */
  targetShare: number;
  /**
   * module status if module can not accept the deposits or can participate in further reward distribution
   */
  status: number;
  /**
   * name of module
   */
  name: string;
  /**
   * block.timestamp of the last deposit of the module
   */
  lastDepositAt: number;
  /**
   * block.number of the last deposit of the module
   */
  lastDepositBlock: number;

  /**
   * Exited validators count
   */
  exitedValidatorsCount: number;

  /**
   * Module activation status
   */
  active: boolean;

  /**
   * Blockhash from the most recent data update
   */
  lastChangedBlockHash: string;
};
