import { Contract } from '@ethersproject/contracts';
import { ethers } from 'ethers';
import { locatorAbi } from './locator.abi';
import { testSetupProvider } from './provider';
import { stakingModuleInterface } from './staking-module-interface';
import * as dotenv from 'dotenv';
import { stakingRouterAbi } from './sr.abi';

export const CURATED_ONCHAIN_V1_TYPE = 'curated-onchain-v1';
export const COMMUNITY_ONCHAIN_V1_TYPE = 'community-onchain-v1';

dotenv.config();

export function getLocator() {
  const locatorAddress = process.env.LOCATOR_DEVNET_ADDRESS;
  if (!locatorAddress) {
    // TODO: custom error
    throw Error();
  }
  const locator = new Contract(locatorAddress, locatorAbi, testSetupProvider);

  return locator;
}

// TODO: use method from council main code
export async function getStakingModules() {
  const locator = getLocator();
  const stakingRouterAddress = await locator.stakingRouter();

  const stakingRouter = new Contract(
    stakingRouterAddress,
    stakingRouterAbi,
    testSetupProvider,
  );
  return await stakingRouter.getStakingModules();
}

export async function getType(contractAddress: string) {
  const contract = new Contract(
    contractAddress,
    stakingModuleInterface,
    testSetupProvider,
  );

  const type = await contract.getType();
  return ethers.utils.parseBytes32String(type);
}
