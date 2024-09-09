export type RegistryKey = {
  /**
   * Public key
   */
  key: string;
  /**
   * Signing key
   */
  depositSignature: string;
  /**
   * Operator index
   */
  operatorIndex: number;
  /**
   * Used key status
   */
  used: boolean;
  /**
   * Key index in contract
   */
  index: number;

  /**
   * Staking module address
   */
  moduleAddress: string;
  /**
   * Vetted key status
   */
  vetted: boolean;
};
