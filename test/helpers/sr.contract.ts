import { ethers, BigNumber } from 'ethers';
import { testSetupProvider } from './provider';
import * as dotenv from 'dotenv';
import {
  IStakingModuleAbi__factory,
  LocatorAbi__factory,
  StakingRouterAbi__factory,
} from 'generated';

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
  ] & {
    id: number;
    stakingModuleAddress: string;
    stakingModuleFee: number;
    treasuryFee: number;
    targetShare: number;
    status: number;
    name: string;
    lastDepositAt: BigNumber;
    lastDepositBlock: BigNumber;
    exitedValidatorsCount: BigNumber;
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
