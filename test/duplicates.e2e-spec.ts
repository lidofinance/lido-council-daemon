import {
  mockMeta,
  keysApiMockGetModules,
  keysApiMockGetAllKeys,
  mockedModuleCurated,
  mockedModuleDvt,
} from './helpers';

// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  STAKING_ROUTER,
  CHAIN_ID,
  GANACHE_PORT,
  NOP_REGISTRY,
  SIMPLE_DVT,
  UNLOCKED_ACCOUNTS_V2,
  FORK_BLOCK_V2,
  SECURITY_MODULE_V2,
  SECURITY_MODULE_OWNER_V2,
} from './constants';

// Contract Factories
import { StakingRouterAbi__factory } from './../src/generated';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';
import { getWalletAddress } from './helpers/deposit';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { ProviderService } from 'provider';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { Server } from 'ganache';
import { GuardianMessageService } from 'guardian/guardian-message';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { addGuardians } from './helpers/dsm';
import { makeServer } from './server';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import { BlsService } from 'bls';
import { mockKey, mockKey2, mockKeyEvent } from './helpers/keys-fixtures';

describe('ganache e2e tests', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let signingKeysRegistryService: SigningKeysRegistryService;
  let guardianMessageService: GuardianMessageService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;

  const setupServer = async () => {
    server = makeServer(FORK_BLOCK_V2, CHAIN_ID, UNLOCKED_ACCOUNTS_V2);
    await server.listen(GANACHE_PORT);
  };

  const setupGuardians = async () => {
    await addGuardians({
      securityModule: SECURITY_MODULE_V2,
      securityModuleOwner: SECURITY_MODULE_OWNER_V2,
    });
  };

  const setupMocks = () => {
    // broker messages
    sendDepositMessage = jest
      .spyOn(guardianMessageService, 'sendDepositMessage')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(guardianMessageService, 'pingMessageBroker')
      .mockImplementation(() => Promise.resolve());
    sendPauseMessage = jest
      .spyOn(guardianMessageService, 'sendPauseMessageV3')
      .mockImplementation(() => Promise.resolve());

    // deposit cache mocks
    jest
      .spyOn(depositIntegrityCheckerService, 'putEventsToTree')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(depositIntegrityCheckerService, 'checkLatestRoot')
      .mockImplementation(() => Promise.resolve(true));
    jest
      .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
      .mockImplementation(() => Promise.resolve(true));
  };

  const setupTestingServices = async (moduleRef) => {
    // leveldb service
    levelDBService = moduleRef.get(DepositsRegistryStoreService);
    signKeyLevelDBService = moduleRef.get(SignKeyLevelDBService);

    await initLevelDB(levelDBService, signKeyLevelDBService);

    // deposit events related services
    depositIntegrityCheckerService = moduleRef.get(
      DepositIntegrityCheckerService,
    );

    const blsService = moduleRef.get(BlsService);
    await blsService.onModuleInit();

    // keys events service
    signingKeysRegistryService = moduleRef.get(SigningKeysRegistryService);

    providerService = moduleRef.get(ProviderService);

    // keys api servies
    keysApiService = moduleRef.get(KeysApiService);

    // rabbitmq message sending methods
    guardianMessageService = moduleRef.get(GuardianMessageService);

    // main service that check keys and make decision
    guardianService = moduleRef.get(GuardianService);
  };

  beforeEach(async () => {
    await setupServer();
    await setupGuardians();
    const moduleRef = await setupTestingModule();
    await setupTestingServices(moduleRef);
    setupMocks();
  }, 20000);

  afterEach(async () => {
    await closeServer(server, levelDBService, signKeyLevelDBService);
  });

  test(
    'skip deposit if find duplicated key',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const walletAddress = await getWalletAddress();

      await levelDBService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      await signingKeysRegistryService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
        },
      });

      // Keys api mock
      const duplicates = [
        { ...mockKey, index: 0 },
        { ...mockKey, index: 1 },
        { ...mockKey, index: 2 },
        { ...mockKey2, moduleAddress: SIMPLE_DVT },
      ];

      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, duplicates, meta);

      // Check that module was not paused
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // just skip on this iteration deposit for Curated staking module
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        { ...mockKey, index: 0, moduleAddress: NOP_REGISTRY },
        { ...mockKey2, index: 0, moduleAddress: SIMPLE_DVT },
      ];

      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(
        keysApiService,
        unusedKeysWithoutDuplicates,
        newMeta,
      );

      sendDepositMessage.mockClear();

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  test(
    'skip deposit if find duplicated key in another staking module',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const walletAddress = await getWalletAddress();

      await levelDBService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // Keys api mock
      const duplicates = [
        { ...mockKey, index: 0, moduleAddress: NOP_REGISTRY },
        { ...mockKey, index: 0, moduleAddress: SIMPLE_DVT },
      ];

      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, duplicates, meta);

      await signingKeysRegistryService.setCachedEvents({
        data: [
          mockKeyEvent,
          {
            ...mockKeyEvent,
            moduleAddress: SIMPLE_DVT,
            blockNumber: mockKeyEvent.blockNumber + 1,
          },
        ],
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number - 1,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
        },
      });

      // Check that module was not paused
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);

      await providerService.provider.send('evm_mine', []);
      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        { ...mockKey, index: 0, moduleAddress: NOP_REGISTRY },
        {
          ...mockKey2,
          moduleAddress: SIMPLE_DVT,
        },
      ];
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(
        keysApiService,
        unusedKeysWithoutDuplicates,
        newMeta,
      );

      sendDepositMessage.mockClear();

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );

      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  test(
    'added unused keys for that deposit was already made',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const walletAddress = await getWalletAddress();

      await levelDBService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // Keys api mock
      const duplicates = [
        { ...mockKey, used: true },
        {
          ...mockKey,
          moduleAddress: SIMPLE_DVT,
          used: false,
        },
      ];

      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, duplicates, meta);

      await signingKeysRegistryService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number - 1,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
        },
      });

      // Check that module was not paused
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      const keysWithoutDulicates = [{ ...mockKey, used: true }];
      const newMeta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keysWithoutDulicates, newMeta);

      sendDepositMessage.mockClear();

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  test('adding not vetted duplicate will not set on soft pause module', async () => {
    const currentBlock = await providerService.provider.getBlock('latest');
    const walletAddress = await getWalletAddress();

    await levelDBService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
      },
    });

    // Keys api mock
    const duplicates = [
      { ...mockKey, index: 0, operatorIndex: 0, used: false, vetted: true },
      {
        ...mockKey,
        index: 1,
        operatorIndex: 0,
        used: false,
        vetted: false,
      },
    ];

    const meta = mockMeta(currentBlock, currentBlock.hash);
    // setup /v1/modules
    const stakingModules = [mockedModuleCurated, mockedModuleDvt];
    keysApiMockGetModules(keysApiService, stakingModules, meta);
    // setup /v1/keys
    keysApiMockGetAllKeys(keysApiService, duplicates, meta);

    await signingKeysRegistryService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number - 2,
        endBlock: currentBlock.number - 1,
        stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
      },
    });

    await guardianService.handleNewBlock();
    await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

    expect(sendDepositMessage).toBeCalledTimes(2);
    expect(sendDepositMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        blockNumber: currentBlock.number,
        guardianAddress: walletAddress,
        guardianIndex: 7,
        stakingModuleId: 1,
      }),
    );
    expect(sendDepositMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        blockNumber: currentBlock.number,
        guardianAddress: walletAddress,
        guardianIndex: 7,
        stakingModuleId: 2,
      }),
    );
  });
});
