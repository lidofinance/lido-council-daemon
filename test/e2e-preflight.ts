import * as dotenv from 'dotenv';
import { BigNumber, constants, providers, utils, Wallet } from 'ethers';
import { LocatorAbi__factory, StakingRouterAbi__factory } from 'generated';
import {
  getLegacyModuleExitedCountSlot,
  getLegacyModuleIndexSlot,
  getModuleAccountingExitedCount,
  getModuleAccountingSlot,
} from './helpers/staking-router-storage';
import { HardhatServer } from './helpers/hardhat-server';
import { cutModulesKeys, verifyModulesKeysCut } from './helpers/reduce-keys';
import { getE2EDsmVersion } from './helpers/dsm-version';
import { LIDO_LOCATOR_BY_NETWORK } from 'contracts/repository/locator/locator.constants';

dotenv.config();

if (process.env.WALLET_PRIVATE_KEY === undefined) {
  process.env.WALLET_PRIVATE_KEY = Wallet.createRandom().privateKey;
}
if (process.env.DELEGATE_PRIVATE_KEYS === undefined) {
  process.env.DELEGATE_PRIVATE_KEYS = process.env.WALLET_PRIVATE_KEY;
}

const PREFLIGHT_CUT_CONFIG = {
  opCount: 3,
  keysCount: 3,
  depositedCount: 3,
};

const fail = (message: string): never => {
  throw new Error(`E2E preflight failed: ${message}`);
};

async function verifyReduceKeysCutOnFork() {
  const hardhatServer = new HardhatServer();

  try {
    await hardhatServer.start();
    await cutModulesKeys(undefined, PREFLIGHT_CUT_CONFIG);
    await verifyModulesKeysCut(PREFLIGHT_CUT_CONFIG);
  } finally {
    await hardhatServer.stop();
  }
}

async function main() {
  getE2EDsmVersion();

  if (process.env.E2E_SKIP_PREFLIGHT === 'true') {
    return;
  }

  const rpcUrl = process.env.RPC_URL ?? fail('RPC_URL is not set');
  const provider = new providers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const locatorAddress =
    process.env.LOCATOR_DEVNET_ADDRESS ??
    LIDO_LOCATOR_BY_NETWORK[network.chainId] ??
    fail(`no Locator address configured for chainId ${network.chainId}`);

  if (!utils.isAddress(locatorAddress)) {
    fail(`LOCATOR_DEVNET_ADDRESS is not a valid address: ${locatorAddress}`);
  }

  const expectedChainId = process.env.CHAIN_ID
    ? Number(process.env.CHAIN_ID)
    : undefined;

  if (expectedChainId && network.chainId !== expectedChainId) {
    fail(
      `RPC_URL chainId is ${network.chainId}, but CHAIN_ID is ${expectedChainId}`,
    );
  }

  const locatorCode = await provider.getCode(locatorAddress);
  if (locatorCode === '0x') {
    fail(`no contract code at LOCATOR_DEVNET_ADDRESS ${locatorAddress}`);
  }

  const locator = LocatorAbi__factory.connect(locatorAddress, provider);
  const stakingRouterAddress = await locator.stakingRouter();

  if (stakingRouterAddress === constants.AddressZero) {
    fail(`locator ${locatorAddress} returned zero stakingRouter address`);
  }

  const stakingRouter = StakingRouterAbi__factory.connect(
    stakingRouterAddress,
    provider,
  );
  const modules = await stakingRouter.getStakingModules();

  if (modules.length === 0) {
    fail(`stakingRouter ${stakingRouterAddress} returned no staking modules`);
  }

  const requiredModuleIds = [1, 2, 5];
  const missingModuleIds = requiredModuleIds.filter(
    (moduleId) => !modules.some((module) => module.id === moduleId),
  );

  if (missingModuleIds.length > 0) {
    fail(
      `stakingRouter ${stakingRouterAddress} is missing required module ids: ${missingModuleIds.join(
        ', ',
      )}`,
    );
  }

  const modulesWithExitedValidators = modules.filter(
    (module) => !BigNumber.from(module.exitedValidatorsCount).isZero(),
  );

  for (const module of modulesWithExitedValidators) {
    const moduleExitedCount = BigNumber.from(module.exitedValidatorsCount);
    const accountingSlotValue = await provider.getStorageAt(
      stakingRouterAddress,
      getModuleAccountingSlot(module.id),
    );

    if (
      getModuleAccountingExitedCount(accountingSlotValue).eq(moduleExitedCount)
    ) {
      continue;
    }

    const indexOneBasedHex = await provider.getStorageAt(
      stakingRouterAddress,
      getLegacyModuleIndexSlot(module.id),
    );

    if (BigNumber.from(indexOneBasedHex).isZero()) {
      fail(
        `reduce-keys.ts cannot locate storage for staking module ${
          module.id
        } on stakingRouter ${stakingRouterAddress}; getStakingModules() returns it with exitedValidatorsCount=${BigNumber.from(
          module.exitedValidatorsCount,
        ).toString()}, but neither current SRStorage accounting nor legacy stakingModuleIndicesOneBased storage matches it`,
      );
    }

    const legacyExitedCount = BigNumber.from(
      await provider.getStorageAt(
        stakingRouterAddress,
        getLegacyModuleExitedCountSlot(BigNumber.from(indexOneBasedHex)),
      ),
    );

    if (!legacyExitedCount.eq(moduleExitedCount)) {
      fail(
        `reduce-keys.ts found legacy storage for staking module ${
          module.id
        } on stakingRouter ${stakingRouterAddress}, but stored exitedValidatorsCount=${legacyExitedCount.toString()} does not match getStakingModules() value ${moduleExitedCount.toString()}`,
      );
    }
  }

  await verifyReduceKeysCutOnFork();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
