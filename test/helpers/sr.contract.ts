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
  const locatorAddress = '0x28FAB2059C713A7F9D8c86Db49f9bb0e96Af1ef8'; // process.env.LOCATOR_DEVNET_ADDRESS;
  if (!locatorAddress) {
    // TODO: custom error
    throw Error();
  }
  return new Contract(locatorAddress, locatorAbi, testSetupProvider);
}

// TODO: use method from council main code
export async function getStakingModules() {
  const locator = await getLocator();
  const stakingRouterAddress = await locator.stakingRouter();

  // TODO: read from council
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
