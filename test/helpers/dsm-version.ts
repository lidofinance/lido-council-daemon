import { utils } from 'ethers';
import type { GuardianExecutionContext } from 'contracts/security';
import { SecurityV5Abi__factory } from 'generated';
import { getWalletAddress } from './deposit';
import { deployEdfUpgradeOnFork } from './edf-fork';
import { testSetupProvider } from './provider';
import { getLocator } from './sr.contract';

export type E2EDsmVersion = 5;

export interface E2EDsmSetup {
  version: E2EDsmVersion;
  dsmAddress: string;
  delegateAddress: string;
  guardianAddress: string;
  guardianIndex: number;
  context: GuardianExecutionContext;
}

export function getE2EDsmVersion(): E2EDsmVersion {
  const version = process.env.E2E_DSM_VERSION ?? '5';

  if (version !== '5') {
    throw new Error(`E2E_DSM_VERSION must be 5, received: ${version}`);
  }

  return 5;
}

export async function setupE2EDsm(): Promise<E2EDsmSetup> {
  getE2EDsmVersion();
  return setupDsmV5(utils.getAddress(getWalletAddress()));
}

async function setupDsmV5(delegateAddress: string): Promise<E2EDsmSetup> {
  const locator = getLocator();
  const deployment = await deployEdfUpgradeOnFork(locator.address);

  if (
    utils.getAddress(deployment.delegateAddress) !==
    utils.getAddress(delegateAddress)
  ) {
    throw new Error(
      `EDF delegate ${deployment.delegateAddress} does not match daemon wallet ${delegateAddress}`,
    );
  }

  await deployment.activate();

  const dsmAddress = utils.getAddress(deployment.dsmAddress);
  const guardianAddress = utils.getAddress(
    deployment.delegationContractAddress,
  );
  process.env.DELEGATION_CONTRACT_ADDRESS = guardianAddress;

  const dsm = SecurityV5Abi__factory.connect(dsmAddress, testSetupProvider);
  const actualVersion = (await dsm.VERSION()).toNumber();
  const guardians = await dsm.getGuardians();
  const guardianIndex = findGuardianIndex(guardians, guardianAddress);

  if (actualVersion !== 5) {
    throw new Error(`EDF setup deployed DSM v${actualVersion} instead of v5`);
  }
  if (guardianIndex === -1) {
    throw new Error(
      `DelegationContract ${guardianAddress} is not a DSM guardian`,
    );
  }

  const context: GuardianExecutionContext = {
    dsmAddress,
    dsmVersion: 5,
    delegateAddress,
    guardianAddress,
    guardianIndex,
    mode: 'edf',
  };

  return {
    version: 5,
    dsmAddress,
    delegateAddress,
    guardianAddress,
    guardianIndex,
    context,
  };
}

function findGuardianIndex(
  guardians: string[],
  guardianAddress: string,
): number {
  return guardians.findIndex(
    (guardian) =>
      utils.getAddress(guardian) === utils.getAddress(guardianAddress),
  );
}
