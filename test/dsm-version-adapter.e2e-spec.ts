import {
  DelegationContractAbi__factory,
  SecurityAbi__factory,
} from 'generated';
import { Configuration } from 'common/config';
import { SecurityService } from 'contracts/security';
import { WalletService } from 'wallet';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { HardhatServer } from './helpers/hardhat-server';
import {
  E2EDsmSetup,
  getE2EDsmVersion,
  setupE2EDsm,
} from './helpers/dsm-version';
import { testSetupProvider } from './helpers/provider';
import { getLocator } from './helpers/sr.contract';
import { CHAIN_ID } from './helpers/config';
import { TEST_SERVER_URL } from './constants';

jest.setTimeout(500_000);

describe('DSM version E2E adapter', () => {
  let hardhatServer: HardhatServer;
  let setup: E2EDsmSetup;
  let securityService: SecurityService;
  let provider: SimpleFallbackJsonRpcBatchProvider;

  beforeAll(async () => {
    hardhatServer = new HardhatServer();
    await hardhatServer.start();
    setup = await setupE2EDsm();

    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    const config = {
      DELEGATION_CONTRACT_ADDRESS: process.env.DELEGATION_CONTRACT_ADDRESS,
    } as Configuration;
    provider = new SimpleFallbackJsonRpcBatchProvider(
      {
        urls: [TEST_SERVER_URL],
        network: CHAIN_ID,
        maxRetries: 1,
        logRetries: false,
        logSuccessfulAttempts: false,
      },
      logger,
    );
    const walletService = new WalletService(
      { set: jest.fn() } as any,
      { labels: jest.fn().mockReturnThis(), set: jest.fn() } as any,
      { labels: jest.fn().mockReturnThis(), set: jest.fn() } as any,
      { labels: jest.fn().mockReturnThis(), set: jest.fn() } as any,
      logger,
      process.env.WALLET_PRIVATE_KEY as string,
      provider,
      config,
    );
    const dsm = SecurityAbi__factory.connect(setup.dsmAddress, provider);

    securityService = new SecurityService(
      { inc: jest.fn() } as any,
      { inc: jest.fn() } as any,
      logger,
      provider,
      { getCachedDSMContract: () => dsm } as any,
      walletService,
      config,
    );
  });

  afterAll(async () => {
    await hardhatServer?.stop();
  });

  it('prepares the requested DSM version and guardian', async () => {
    const locator = getLocator();
    const dsm = SecurityAbi__factory.connect(
      setup.dsmAddress,
      testSetupProvider,
    );
    const guardians = await dsm.getGuardians();

    expect(setup.version).toBe(getE2EDsmVersion());
    expect((await dsm.VERSION()).toNumber()).toBe(setup.version);
    expect(await locator.depositSecurityModule()).toBe(setup.dsmAddress);
    expect(guardians[setup.guardianIndex]).toBe(setup.guardianAddress);
    expect(setup.context).toEqual({
      dsmAddress: setup.dsmAddress,
      dsmVersion: setup.version,
      delegateAddress: setup.delegateAddress,
      guardianAddress: setup.guardianAddress,
      guardianIndex: setup.guardianIndex,
      mode: setup.version === 5 ? 'edf' : 'legacy-eoa',
    });
  });

  it('connects the daemon delegate through the selected guardian mode', async () => {
    if (setup.version === 4) {
      expect(setup.guardianAddress).toBe(setup.delegateAddress);
      expect(process.env.DELEGATION_CONTRACT_ADDRESS).toBe(
        '0x0000000000000000000000000000000000000001',
      );
      return;
    }

    const delegationContract = DelegationContractAbi__factory.connect(
      setup.guardianAddress,
      testSetupProvider,
    );

    expect(await delegationContract.getDelegate()).toBe(setup.delegateAddress);
    expect(process.env.DELEGATION_CONTRACT_ADDRESS).toBe(setup.guardianAddress);
  });

  it('executes a privileged DSM call through the selected guardian mode', async () => {
    const block = await provider.getBlock('latest');
    const signature = await securityService.signPauseDataV3(
      block.number,
      block.hash,
      setup.context,
    );

    expect(await securityService.isDepositsPaused()).toBe(false);

    await securityService.pauseDepositsV3(
      block.number,
      signature,
      setup.context,
    );

    expect(await securityService.isDepositsPaused()).toBe(true);
  });
});
