import { BigNumber } from '@ethersproject/bignumber';
import {
  StakingRouterAbi__factory,
  LidoAbi__factory,
} from 'generated';
import { HardhatServer } from './helpers/hardhat-server';
import { getLocator } from './helpers/sr.contract';
import { testSetupProvider } from './helpers/provider';

jest.setTimeout(60_000);

describe.skip('ignoreDeposits fork test', () => {
  let hardhatServer: HardhatServer;

  beforeAll(async () => {
    hardhatServer = new HardhatServer();
    await hardhatServer.start();
  });

  afterAll(async () => {
    await hardhatServer.stop();
  });

  it('getDepositableEther returns a valid BigNumber', async () => {
    const locator = getLocator();
    const lidoAddress = await locator.lido();
    const lido = LidoAbi__factory.connect(lidoAddress, testSetupProvider);

    const depositableEther = await lido.getDepositableEther();

    expect(BigNumber.isBigNumber(depositableEther)).toBe(true);
  });

  it('getStakingModuleMaxDepositsCount returns allocation for each module', async () => {
    const locator = getLocator();

    const stakingRouterAddress = await locator.stakingRouter();
    const stakingRouter = StakingRouterAbi__factory.connect(
      stakingRouterAddress,
      testSetupProvider,
    );

    const lidoAddress = await locator.lido();
    const lido = LidoAbi__factory.connect(lidoAddress, testSetupProvider);

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
    const locator = getLocator();

    const stakingRouterAddress = await locator.stakingRouter();
    const stakingRouter = StakingRouterAbi__factory.connect(
      stakingRouterAddress,
      testSetupProvider,
    );

    const modules = await stakingRouter.getStakingModules();
    const zeroEther = BigNumber.from(0);

    for (const mod of modules) {
      const maxDepositsCount =
        await stakingRouter.getStakingModuleMaxDepositsCount(mod.id, zeroEther);

      expect(maxDepositsCount.eq(0)).toBe(true);
    }
  });
});
