import { LoggerService } from '@nestjs/common';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { Configuration } from 'common/config';
import {
  DelegationContractAbi__factory,
  LocatorAbi__factory,
  OssifiableProxyAbi__factory,
  SecurityV5Abi__factory,
} from 'generated';
import { RepositoryService } from 'contracts/repository';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { SecurityService } from 'contracts/security';
import { HardhatServer } from './helpers/hardhat-server';
import {
  deployEdfUpgradeOnFork,
  LOCATOR_CONFIG_KEYS,
  readLocatorConfig,
} from './helpers/edf-fork';
import { CHAIN_ID } from './helpers/config';
import { testSetupProvider } from './helpers/provider';
import { TEST_SERVER_URL } from './constants';

jest.setTimeout(180_000);

describe('EDF Locator transition on a Hoodi fork', () => {
  let hardhatServer: HardhatServer;

  beforeAll(async () => {
    if (!process.env.RPC_URL) {
      throw new Error('RPC_URL is required to run the EDF fork transition');
    }
    if (!process.env.LOCATOR_DEVNET_ADDRESS) {
      throw new Error(
        'LOCATOR_DEVNET_ADDRESS is required to run the EDF fork transition',
      );
    }

    hardhatServer = new HardhatServer();
    await hardhatServer.start();
  });

  afterAll(async () => {
    await hardhatServer?.stop();
  });

  it('updates the Locator and daemon DSM cache after the EDF contracts are deployed', async () => {
    const locatorAddress = process.env.LOCATOR_DEVNET_ADDRESS as string;
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as LoggerService;
    const provider = new SimpleFallbackJsonRpcBatchProvider(
      {
        urls: [TEST_SERVER_URL],
        network: CHAIN_ID,
        maxRetries: 1,
        logRetries: false,
        logSuccessfulAttempts: false,
      },
      logger,
    );
    const locatorService = new LocatorService(provider, {
      LOCATOR_DEVNET_ADDRESS: locatorAddress,
    } as Configuration);
    const repository = new RepositoryService(logger, provider, locatorService);

    const blockBefore = await testSetupProvider.getBlock('latest');
    await repository.initCachedContracts({ blockHash: blockBefore.hash });
    const cachedDsmBefore = repository.getCachedDSMContract().address;

    const deployment = await deployEdfUpgradeOnFork(locatorAddress);
    const securityService = new SecurityService(
      { inc: jest.fn() } as any,
      { inc: jest.fn() } as any,
      logger,
      provider,
      repository,
      {
        address: deployment.delegateAddress,
        wallet: { connect: () => provider },
      } as any,
      {
        DELEGATION_CONTRACT_ADDRESS: deployment.delegationContractAddress,
      } as Configuration,
    );
    const contextBefore = await securityService.getGuardianExecutionContext({
      blockHash: blockBefore.hash,
    });

    expect(cachedDsmBefore).toBe(deployment.previousDsmAddress);
    expect(deployment.dsmAddress).not.toBe(deployment.previousDsmAddress);
    expect(deployment.locatorImplementationAddress).not.toBe(
      deployment.previousLocatorImplementation,
    );
    expect(contextBefore).toEqual(
      expect.objectContaining({
        dsmAddress: deployment.previousDsmAddress,
        mode: 'legacy-eoa',
        guardianAddress: deployment.delegateAddress,
        delegateAddress: deployment.delegateAddress,
      }),
    );

    const receipt = await deployment.activate();
    const blockAfter = await testSetupProvider.getBlock(receipt.blockNumber);
    await repository.initCachedContracts({ blockHash: blockAfter.hash });

    const locator = LocatorAbi__factory.connect(
      locatorAddress,
      testSetupProvider,
    );
    const proxy = OssifiableProxyAbi__factory.connect(
      locatorAddress,
      testSetupProvider,
    );
    const dsm = SecurityV5Abi__factory.connect(
      deployment.dsmAddress,
      testSetupProvider,
    );
    const delegationContract = DelegationContractAbi__factory.connect(
      deployment.delegationContractAddress,
      testSetupProvider,
    );
    const locatorConfigAfter = await readLocatorConfig(locator);
    const contextAfter = await securityService.getGuardianExecutionContext({
      blockHash: blockAfter.hash,
    });

    expect(await proxy.proxy__getImplementation()).toBe(
      deployment.locatorImplementationAddress,
    );
    expect((await dsm.VERSION()).toNumber()).toBe(5);
    expect(await dsm.isGuardian(deployment.delegationContractAddress)).toBe(
      true,
    );
    expect(await delegationContract.getDelegate()).toBe(
      deployment.delegateAddress,
    );
    expect(repository.getCachedDSMContract().address).toBe(
      deployment.dsmAddress,
    );
    expect(contextAfter).toEqual({
      dsmAddress: deployment.dsmAddress,
      dsmVersion: 5,
      delegateAddress: deployment.delegateAddress,
      guardianAddress: deployment.delegationContractAddress,
      guardianIndex: 0,
      mode: 'edf',
    });

    for (const key of LOCATOR_CONFIG_KEYS) {
      const expectedAddress =
        key === 'depositSecurityModule'
          ? deployment.dsmAddress
          : deployment.locatorConfigBefore[key];
      expect(locatorConfigAfter[key]).toBe(expectedAddress);
    }
  });
});
