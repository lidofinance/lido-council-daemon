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

/**
 * Legacy (historical) withdrawal credentials that were legitimately used by a
 * Lido module before its withdrawal credentials were rotated on-chain.
 *
 * The very first Lido deposits used 0x00 BLS withdrawal credentials before The
 * Merge; the WC was later rotated to the 0x01 withdrawal vault. Those early
 * `used` keys still have their earliest deposit bound to the old 0x00 WC, which
 * the contracts no longer return. Without this list the historical front-run
 * check would mis-detect those legitimate legacy deposits as theft and pause
 * the module.
 *
 * Keyed by chain id -> lowercased staking module address -> legacy WCs. Only
 * applies to `used` keys (historical front-run check); vetted-unused keys that
 * reappear with a legacy WC are still treated as a front-run attempt.
 */
export const LEGACY_WITHDRAWAL_CREDENTIALS: Record<
  number,
  Record<string, string[]>
> = {
  // mainnet, Curated module (module id 1)
  1: {
    '0x55032650b14df07b85bf18a3a3ec8e0af2e028d5': [
      '0x009690e5d4472c7c0dbdf490425d89862535d2a52fb686333f3a0a9ff5d2125e',
    ],
  },
};

/**
 * Legacy withdrawal credentials that the given module legitimately used in the
 * past on the given chain (case-insensitive on the module address). Empty when
 * the module never rotated its WC.
 */
export function getLegacyModuleWCs(
  chainId: number,
  moduleAddress: string,
): string[] {
  return (
    LEGACY_WITHDRAWAL_CREDENTIALS[chainId]?.[moduleAddress.toLowerCase()] ?? []
  );
}
