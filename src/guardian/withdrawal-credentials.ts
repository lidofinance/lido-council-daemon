import { utils } from 'ethers';

/**
 * Build a staking module's withdrawal credentials from the shared base WC and
 * the module's WC type byte.
 *
 * All Lido modules share the same base withdrawal credentials and differ only
 * in the first (type) byte — e.g. 0x01 for curated modules, 0x02 for CMv2.
 * This is the single place that turns `withdrawalCredentialsType` into the WC
 * string used by every WC-dependent decision (key validation, front-run,
 * cross-type, wrong-WC-type), so it is kept as a pure, unit-tested function.
 */
export function buildModuleWc(
  withdrawalCredentialsType: number,
  baseWC: string,
): string {
  const typePrefix = utils.hexZeroPad(
    utils.hexlify(withdrawalCredentialsType),
    1,
  );
  // drop the base "0x" + type byte (4 chars) and prepend the module's type byte
  return typePrefix + baseWC.slice(4);
}
