import * as dotenv from 'dotenv';
import { BigNumber, constants, providers, utils } from 'ethers';
import { LocatorAbi__factory, StakingRouterAbi__factory } from 'generated';

dotenv.config();

const SR_INDICES_MAPPING_POSITION = utils.solidityKeccak256(
  ['string'],
  ['lido.StakingRouter.stakingModuleIndicesOneBased'],
);

const getModuleIndexSlot = (moduleId: number) =>
  utils.solidityKeccak256(
    ['uint256', 'uint256'],
    [moduleId, SR_INDICES_MAPPING_POSITION],
  );

const fail = (message: string): never => {
  throw new Error(`E2E preflight failed: ${message}`);
};

async function main() {
  if (process.env.E2E_SKIP_PREFLIGHT === 'true') {
    return;
  }

  const rpcUrl = process.env.RPC_URL ?? fail('RPC_URL is not set');
  const locatorAddress =
    process.env.LOCATOR_DEVNET_ADDRESS ??
    fail('LOCATOR_DEVNET_ADDRESS is not set');

  if (!utils.isAddress(locatorAddress)) {
    fail(`LOCATOR_DEVNET_ADDRESS is not a valid address: ${locatorAddress}`);
  }

  const provider = new providers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
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

  const requiredModuleIds = [1, 2];
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
    const indexOneBasedHex = await provider.getStorageAt(
      stakingRouterAddress,
      getModuleIndexSlot(module.id),
    );

    if (BigNumber.from(indexOneBasedHex).isZero()) {
      fail(
        `reduce-keys.ts cannot locate storage for staking module ${
          module.id
        } on stakingRouter ${stakingRouterAddress}; getStakingModules() returns it with exitedValidatorsCount=${BigNumber.from(
          module.exitedValidatorsCount,
        ).toString()}, but the hard-coded stakingModuleIndicesOneBased slot is empty`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
