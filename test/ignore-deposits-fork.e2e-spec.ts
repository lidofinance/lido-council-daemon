import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber } from '@ethersproject/bignumber';
import {
  LocatorAbi__factory,
  StakingRouterAbi__factory,
  LidoAbi__factory,
} from 'generated';
import { HardhatServer } from './helpers/hardhat-server';
import { TEST_SERVER_URL } from './constants';

const MAINNET_LOCATOR = '0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb';

describe('ignoreDeposits fork test', () => {
  let hardhatServer: HardhatServer;
  let provider: JsonRpcProvider;

  beforeAll(async () => {
    hardhatServer = new HardhatServer();
    await hardhatServer.start();
    provider = new JsonRpcProvider(TEST_SERVER_URL);
  });

  afterAll(async () => {
    await hardhatServer.stop();
  });

  it('getDepositableEther returns a valid BigNumber', async () => {
    const locator = LocatorAbi__factory.connect(MAINNET_LOCATOR, provider);
    const lidoAddress = await locator.lido();
    const lido = LidoAbi__factory.connect(lidoAddress, provider);

    const depositableEther = await lido.getDepositableEther();

    expect(BigNumber.isBigNumber(depositableEther)).toBe(true);
  });

  it('getStakingModuleMaxDepositsCount returns allocation for each module', async () => {
    const locator = LocatorAbi__factory.connect(MAINNET_LOCATOR, provider);

    const stakingRouterAddress = await locator.stakingRouter();
    const stakingRouter = StakingRouterAbi__factory.connect(
      stakingRouterAddress,
      provider,
    );

    const lidoAddress = await locator.lido();
    const lido = LidoAbi__factory.connect(lidoAddress, provider);

    const depositableEther = await lido.getDepositableEther();
    const modules = await stakingRouter.getStakingModules();

    expect(modules.length).toBeGreaterThan(0);

    for (const mod of modules) {
      const maxDepositsCount =
        await stakingRouter.getStakingModuleMaxDepositsCount(
          mod.id,
          depositableEther,
        );

      expect(maxDepositsCount.gte(0)).toBe(true);
    }
  });

  it('module with zero depositable ether has no allocation', async () => {
    const locator = LocatorAbi__factory.connect(MAINNET_LOCATOR, provider);

    const stakingRouterAddress = await locator.stakingRouter();
    const stakingRouter = StakingRouterAbi__factory.connect(
      stakingRouterAddress,
      provider,
    );

    const modules = await stakingRouter.getStakingModules();
    const zeroEther = BigNumber.from(0);

    for (const mod of modules) {
      const maxDepositsCount =
        await stakingRouter.getStakingModuleMaxDepositsCount(
          mod.id,
          zeroEther,
        );

      expect(maxDepositsCount.eq(0)).toBe(true);
    }
  });

});
