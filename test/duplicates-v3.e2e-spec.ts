// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  STAKING_ROUTER,
  CHAIN_ID,
  FORK_BLOCK,
  GANACHE_PORT,
  sk,
  pk,
  NOP_REGISTRY,
  SIMPLE_DVT,
  UNLOCKED_ACCOUNTS,
} from './constants';

// Contract Factories
import { StakingRouterAbi__factory } from '../src/generated';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
import { LevelDBService } from 'contracts/deposit/leveldb';
import { getWalletAddress } from './helpers/deposit';
import { ProviderService } from 'provider';
import { DepositService } from 'contracts/deposit';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SecurityService } from 'contracts/security';
import { Server } from 'ganache';
import { GuardianMessageService } from 'guardian/guardian-message';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { makeServer } from './server';
import { addGuardians } from './helpers/dsm';
import { BlsService } from 'bls';
import { mockKey, mockKey2, mockKeyEvent } from './helpers/keys-fixtures';
import { DepositIntegrityCheckerService } from 'contracts/deposit/integrity-checker';
import {
  keysApiMockGetAllKeys,
  keysApiMockGetModules,
  mockedModuleCurated,
  mockedModuleDvt,
  mockMeta,
} from './helpers';

describe('Deposits in case of duplicates', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let depositService: DepositService;
  let securityService: SecurityService;

  let levelDBService: LevelDBService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;

  let signKeyLevelDBService: SignKeyLevelDBService;
  let signingKeyEventsCacheService: SigningKeyEventsCacheService;

  let guardianMessageService: GuardianMessageService;
  // methods mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

  const setupServer = async () => {
    server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
    await server.listen(GANACHE_PORT);
  };

  const setupGuardians = async () => {
    await addGuardians();
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
    sendUnvetMessage = jest
      .spyOn(guardianMessageService, 'sendUnvetMessage')
      .mockImplementation(() => Promise.resolve());

    // deposit cache mocks
    jest
      .spyOn(depositIntegrityCheckerService, 'checkLatestRoot')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
      .mockImplementation(() => Promise.resolve());

    // mock unvetting method of contract
    // as we dont use real keys api and work with fixtures of operators and keys
    // we cant make real unvetting
    unvetSigningKeys = jest
      .spyOn(securityService, 'unvetSigningKeys')
      .mockImplementation(() => Promise.resolve(null as any));
  };

  const setupTestingServices = async (moduleRef) => {
    // leveldb service
    levelDBService = moduleRef.get(LevelDBService);
    signKeyLevelDBService = moduleRef.get(SignKeyLevelDBService);

    await initLevelDB(levelDBService, signKeyLevelDBService);

    // deposit events related services
    depositIntegrityCheckerService = moduleRef.get(
      DepositIntegrityCheckerService,
    );
    depositService = moduleRef.get(DepositService);

    const blsService = moduleRef.get(BlsService);
    await blsService.onModuleInit();

    // keys events service
    signingKeyEventsCacheService = moduleRef.get(SigningKeyEventsCacheService);

    providerService = moduleRef.get(ProviderService);

    // dsm methods and council sign services
    securityService = moduleRef.get(SecurityService);

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
  }, 15000);

  test(
    'skip deposits for module if find duplicated key across operator',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // await providerService.provider.send('evm_mine', []);

      // Set deposit cache
      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const earliestKey = {
        ...mockKey,
        operatorIndex: 0,
        moduleAddress: NOP_REGISTRY,
        index: 0,
      };
      const duplicates = [
        earliestKey,
        { ...mockKey, operatorIndex: 0, moduleAddress: NOP_REGISTRY, index: 1 },
        { ...mockKey, operatorIndex: 0, moduleAddress: NOP_REGISTRY, index: 2 },
      ];
      // Mock Keys API
      const vettedUnusedKeys = [
        ...duplicates,
        {
          ...mockKey2,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      // setup elBlockSnapshot
      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, vettedUnusedKeys, meta);

      // mock events cache to check
      await signingKeyEventsCacheService.setCachedEvents({
        data: [], // dont need events in this test
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number,
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

      const walletAddress = getWalletAddress();
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
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000001',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        earliestKey,
        {
          ...mockKey2,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      expect(newBlock.number).toBeGreaterThan(currentBlock.number);

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
      sendUnvetMessage.mockClear();
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendDepositMessage.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
      expect(sendUnvetMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test(
    'skip deposits for module if find duplicated key across operators of two modules',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const walletAddress = getWalletAddress();

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const duplicates = [
        { ...mockKey, moduleAddress: NOP_REGISTRY },
        {
          ...mockKey,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      // setup elBlockSnapshot
      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, duplicates, meta);

      await signingKeyEventsCacheService.setCachedEvents({
        data: [
          mockKeyEvent,
          // key of second module was added later
          {
            ...mockKeyEvent,
            moduleAddress: SIMPLE_DVT,
            blockNumber: mockKeyEvent.blockNumber + 1,
            blockHash: 'somefakehash',
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

      // just skip on this iteration deposit for Curated staking module
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      // check that duplicates problem didnt trigger pause
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        { ...mockKey, moduleAddress: NOP_REGISTRY },
      ];

      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      // setup elBlockSnapshot
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
      sendUnvetMessage.mockClear();

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
      expect(sendUnvetMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test(
    'skip deposits for module if find duplicated key across operators of one modules',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const walletAddress = await getWalletAddress();

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const duplicates = [
        { ...mockKey, index: 0, operatorIndex: 0 },
        {
          ...mockKey,
          index: 0,
          operatorIndex: 1,
        },
      ];

      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, duplicates, meta);

      await signingKeyEventsCacheService.setCachedEvents({
        data: [
          {
            ...mockKeyEvent,
            blockNumber: currentBlock.number - 4,
            blockHash: 'somefakehash1',
            operatorIndex: 0,
          },
          // key of second operator was added later
          {
            ...mockKeyEvent,
            blockNumber: currentBlock.number - 3,
            blockHash: 'somefakehash2',
            operatorIndex: 1,
          },
        ],
        headers: {
          startBlock: currentBlock.number - 5,
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
      // check that duplicates problem didnt trigger pause
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
          operatorIds: '0x0000000000000001',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module

      const noDuplicatesKeys = [{ ...mockKey, operatorIndex: 0 }];

      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      // setup elBlockSnapshot
      const newMeta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, noDuplicatesKeys, newMeta);

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();

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
      const walletAddress = getWalletAddress();

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const duplicates = [
        { ...mockKey, operatorIndex: 0, used: true },
        {
          ...mockKey,
          operatorIndex: 1,
          used: false,
        },
      ];

      // setup elBlockSnapshot
      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, duplicates, meta);

      await signingKeyEventsCacheService.setCachedEvents({
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

      // deposit will be skipped until unvetting
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
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
          operatorIds: '0x0000000000000001',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      const noDuplicatesKeys = [{ ...mockKey, operatorIndex: 0, used: true }];
      const newMeta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, noDuplicatesKeys, newMeta);

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();

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
      expect(sendUnvetMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test('adding not vetted duplicate will not set on soft pause module', async () => {
    const currentBlock = await providerService.provider.getBlock('latest');
    const walletAddress = await getWalletAddress();

    await depositService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
      },
    });

    const duplicates = [
      { ...mockKey, index: 0, operatorIndex: 1, used: false, vetted: true },
      {
        ...mockKey,
        index: 1,
        operatorIndex: 1,
        used: false,
        vetted: false,
      },
    ];

    // setup elBlockSnapshot
    const meta = mockMeta(currentBlock, currentBlock.hash);
    // setup /v1/modules
    const stakingModules = [mockedModuleCurated, mockedModuleDvt];
    keysApiMockGetModules(keysApiService, stakingModules, meta);
    // setup /v1/keys
    keysApiMockGetAllKeys(keysApiService, duplicates, meta);

    await signingKeyEventsCacheService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number - 2,
        endBlock: currentBlock.number - 1,
        stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
      },
    });

    await depositService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
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

  test(
    'skip deposits if cannot resolve duplicates',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const walletAddress = await getWalletAddress();

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const duplicates = [
        { ...mockKey, moduleAddress: NOP_REGISTRY },
        {
          ...mockKey,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, duplicates, meta);

      await signingKeyEventsCacheService.setCachedEvents({
        data: [mockKeyEvent],
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

      // just skip on this iteration deposit for Curated staking module
      expect(sendDepositMessage).toBeCalledTimes(0);

      // check that duplicates problem didnt trigger pause
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(unvetSigningKeys).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      await providerService.provider.send('evm_mine', []);
      const noDuplicatesKeys = [{ ...mockKey, moduleAddress: NOP_REGISTRY }];
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, noDuplicatesKeys, newMeta);

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();

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
      expect(sendUnvetMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test(
    'if duplicates in both modules, skip deposits for modules and unvet only for first on first iteration',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // await providerService.provider.send('evm_mine', []);

      // Set deposit cache
      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const earliestKey = {
        ...mockKey,
        operatorIndex: 0,
        moduleAddress: NOP_REGISTRY,
        index: 0,
      };
      const duplicatesСurated = [
        earliestKey,
        { ...mockKey, operatorIndex: 0, moduleAddress: NOP_REGISTRY, index: 1 },
        { ...mockKey, operatorIndex: 0, moduleAddress: NOP_REGISTRY, index: 2 },
      ];

      const duplicatesSimpleDVT = [
        {
          ...mockKey2,
          operatorIndex: 0,
          moduleAddress: SIMPLE_DVT,
          index: 0,
        },
        {
          ...mockKey2,
          operatorIndex: 0,
          moduleAddress: SIMPLE_DVT,
          index: 1,
        },
      ];

      // Mock Keys API
      const vettedUnusedKeys = [...duplicatesСurated, ...duplicatesSimpleDVT];

      // setup elBlockSnapshot
      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, vettedUnusedKeys, meta);

      // mock events cache to check
      await signingKeyEventsCacheService.setCachedEvents({
        data: [], // dont need events in this test
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number,
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

      const walletAddress = getWalletAddress();
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
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 1,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000001',
        }),
      );
    },
    TESTS_TIMEOUT,
  );
});
