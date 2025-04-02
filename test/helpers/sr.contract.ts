import { ethers, BigNumber } from 'ethers';
import { accountImpersonate, testSetupProvider } from './provider';
import * as dotenv from 'dotenv';
import {
  IStakingModuleAbi__factory,
  LocatorAbi__factory,
  StakingRouterAbi__factory,
} from 'generated';
import { AGENT } from './agent';

export const CURATED_ONCHAIN_V1_TYPE = 'curated-onchain-v1';
export const COMMUNITY_ONCHAIN_V1_TYPE = 'community-onchain-v1';

dotenv.config();

export function getLocator() {
  const locatorAddress = process.env.LOCATOR_DEVNET_ADDRESS;
  if (!locatorAddress) {
    throw new Error('Locator address was not set');
  }

  return LocatorAbi__factory.connect(locatorAddress, testSetupProvider);
}

export async function getStakingModules(): Promise<
  ([
    number,
    string,
    number,
    number,
    number,
    number,
    string,
    BigNumber,
    BigNumber,
    BigNumber,
    number,
    BigNumber,
    BigNumber,
  ] & {
    id: number;
    stakingModuleAddress: string;
    stakingModuleFee: number;
    treasuryFee: number;
    stakeShareLimit: number;
    status: number;
    name: string;
    lastDepositAt: BigNumber;
    lastDepositBlock: BigNumber;
    exitedValidatorsCount: BigNumber;
    priorityExitShareThreshold: number;
    maxDepositsPerBlock: BigNumber;
    minDepositBlockDistance: BigNumber;
  })[]
> {
  const locator = getLocator();
  const stakingRouterAddress = await locator.stakingRouter();

  const contract = StakingRouterAbi__factory.connect(
    stakingRouterAddress,
    testSetupProvider,
  );
  return await contract.getStakingModules();
}

export async function prioritizeShareLimit(moduleId: number) {
  const locator = getLocator();
  const stakingRouterAddress = await locator.stakingRouter();
  const network = await testSetupProvider.getNetwork();
  const CHAIN_ID = network.chainId;
  const agent = AGENT[CHAIN_ID];
  await accountImpersonate(agent);
  const agentSigner = testSetupProvider.getSigner(agent);

  const contract = StakingRouterAbi__factory.connect(
    stakingRouterAddress,
    agentSigner,
  );

  const modules = await getStakingModules();

  await Promise.all(
    modules.map(async (stakingModule) => {
      if (stakingModule.id === moduleId) return;

      await contract.updateStakingModule(
        stakingModule.id,
        1,
        stakingModule.priorityExitShareThreshold,
        stakingModule.stakingModuleFee,
        stakingModule.treasuryFee,
        stakingModule.maxDepositsPerBlock,
        stakingModule.minDepositBlockDistance,
      );
    }),
  );
}

export async function getStakingModulesInfo() {
  const srModules = await getStakingModules();
  const stakingModulesAddresses = srModules.map(
    (stakingModule) => stakingModule.stakingModuleAddress,
  );

  const curatedModule = srModules.find((srModule) => srModule.id === 1);
  if (!curatedModule) {
    throw new Error('Curated module with id = 1 was not found in list');
  }
  const curatedModuleAddress = curatedModule.stakingModuleAddress;

  const sdvtModule = srModules.find((srModule) => srModule.id === 2);
  if (!sdvtModule) {
    throw new Error('SDVT module with id = 2 was not found in list');
  }
  const sdvtModuleAddress = sdvtModule.stakingModuleAddress;

  return {
    stakingModulesAddresses,
    curatedModuleAddress,
    sdvtModuleAddress,
    srModules,
  };
}

export async function getType(contractAddress: string) {
  const contract = IStakingModuleAbi__factory.connect(
    contractAddress,
    testSetupProvider,
  );

  const type = await contract.getType();
  return ethers.utils.parseBytes32String(type);
}
