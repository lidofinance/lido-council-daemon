import { utils } from 'ethers';
import type { GuardianExecutionContext } from 'contracts/security';
import { SecurityAbi__factory, SecurityV5Abi__factory } from 'generated';
import { getWalletAddress } from './deposit';
import { addGuardians, getSecurityOwner } from './dsm';
import { deployEdfUpgradeOnFork } from './edf-fork';
import { testSetupProvider } from './provider';
import { getLocator } from './sr.contract';

export type E2EDsmVersion = 4 | 5;

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

  if (version !== '4' && version !== '5') {
    throw new Error(
      `E2E_DSM_VERSION must be either 4 or 5, received: ${version}`,
    );
  }

  return Number(version) as E2EDsmVersion;
}

export async function setupE2EDsm(): Promise<E2EDsmSetup> {
  const version = getE2EDsmVersion();
  const delegateAddress = utils.getAddress(getWalletAddress());

  if (version === 5) {
    return setupDsmV5(delegateAddress);
  }

  return setupDsmV4(delegateAddress);
}

async function setupDsmV4(delegateAddress: string): Promise<E2EDsmSetup> {
  delete process.env.DELEGATION_CONTRACT_ADDRESS;

  const locator = getLocator();
  const dsmAddress = utils.getAddress(await locator.depositSecurityModule());
  const dsm = SecurityAbi__factory.connect(dsmAddress, testSetupProvider);
  const actualVersion = (await dsm.VERSION()).toNumber();

  if (actualVersion !== 4) {
    throw new Error(
      `E2E_DSM_VERSION=4 requires DSM v4 on the fork, received v${actualVersion}`,
    );
  }

  let guardians = await dsm.getGuardians();
  let guardianIndex = findGuardianIndex(guardians, delegateAddress);

  if (guardianIndex === -1) {
    await addGuardians({
      securityModuleAddress: dsmAddress,
      securityModuleOwner: await getSecurityOwner(),
    });
    guardians = await dsm.getGuardians();
    guardianIndex = findGuardianIndex(guardians, delegateAddress);
  }

  if (guardianIndex === -1) {
    throw new Error(
      `Failed to add delegate ${delegateAddress} as DSM guardian`,
    );
  }

  const context: GuardianExecutionContext = {
    dsmAddress,
    dsmVersion: 4,
    delegateAddress,
    guardianAddress: delegateAddress,
    guardianIndex,
    mode: 'legacy-eoa',
  };

  return {
    version: 4,
    dsmAddress,
    delegateAddress,
    guardianAddress: delegateAddress,
    guardianIndex,
    context,
  };
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
