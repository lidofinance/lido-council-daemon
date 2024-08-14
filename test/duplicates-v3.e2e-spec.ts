import {
  mockOperator1,
  mockOperator2,
  mockedDvtOperators,
  mockedOperators,
  setupMockModules,
} from './helpers';

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
  CSM,
  SANDBOX,
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
import { makeDeposit, signDeposit } from './helpers/deposit';
import { ProviderService } from 'provider';
import { DepositService } from 'contracts/deposit';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SecurityService } from 'contracts/security';
import { Server } from 'ganache';
import { GuardianMessageService } from 'guardian/guardian-message';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { StakingRouterService } from 'staking-router';
import { makeServer } from './server';
import { addGuardians } from './helpers/dsm';
import { BlsService } from 'bls';
import { mockKey, mockKey2, mockKeyEvent } from './helpers/keys-fixtures';
import { DepositIntegrityCheckerService } from 'contracts/deposit/integrity-checker';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';

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

  let stakingModuleGuardService: StakingModuleGuardService;
  let guardianMessageService: GuardianMessageService;
  let stakingRouterService: StakingRouterService;

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
      .mockImplementation(() => Promise.resolve());
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
    stakingModuleGuardService = moduleRef.get(StakingModuleGuardService);
    stakingRouterService = moduleRef.get(StakingRouterService);
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

      // TODO: mine new block instead
      const { depositData } = signDeposit(pk, sk);
      const { wallet } = await makeDeposit(depositData, providerService);

      // Set deposit cache
      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // Keys api mock
      const unusedKeys = [
        mockKey,
        { ...mockKey, index: 1 },
        {
          ...mockKey,
          index: 2,
        },
        {
          ...mockKey2,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      const { curatedModule, sdvtModule } = setupMockModules(
        currentBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeys,
      );

      // mock events cache to check
      await signingKeyEventsCacheService.setCachedEvents({
        data: [], // dont need events in this test
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
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
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
      // check that duplicates problem didnt trigger pause
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000001',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        mockKey,
        {
          ...mockKey2,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      const newBlock = await providerService.provider.getBlock('latest');
      expect(newBlock.number).toBeGreaterThan(currentBlock.number);

      setupMockModules(
        newBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeysWithoutDuplicates,
      );

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendDepositMessage.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
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
      const { depositData } = signDeposit(pk, sk);
      const { wallet } = await makeDeposit(depositData, providerService);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const unusedKeys = [
        mockKey,
        {
          ...mockKey,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      const { sdvtModule, curatedModule } = setupMockModules(
        currentBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeys,
      );

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
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
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
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
        }),
      );
      // check that duplicates problem didnt trigger pause
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
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
        mockKey,
        {
          ...mockKey2,
          moduleAddress: SIMPLE_DVT,
        },
      ];
      const newBlock = await providerService.provider.getBlock('latest');
      setupMockModules(
        newBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeysWithoutDuplicates,
      );

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
        }),
      );

      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
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
      const { depositData } = signDeposit(pk, sk);
      const { wallet } = await makeDeposit(depositData, providerService);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const unusedKeys = [
        { ...mockKey, operatorIndex: mockOperator1.index },
        {
          ...mockKey,
          operatorIndex: mockOperator2.index,
        },
      ];

      const { curatedModule, sdvtModule } = setupMockModules(
        currentBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeys,
      );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [
          { ...mockKeyEvent, operatorIndex: mockOperator1.index },
          // key of second module was added later
          {
            ...mockKeyEvent,
            operatorIndex: mockOperator2.index,
            blockNumber: mockKeyEvent.blockNumber + 1,
            blockHash: 'somefakehash',
          },
        ],
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number - 1,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
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
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
      // check that duplicates problem didnt trigger pause
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
          operatorIds: '0x0000000000000001',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module

      const unusedKeysWithoutDuplicates = [
        { ...mockKey, operatorIndex: mockOperator1.index },
        {
          ...mockKey2,
          operatorIndex: mockOperator2.index,
        },
      ];

      const newBlock = await providerService.provider.getBlock('latest');
      setupMockModules(
        newBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeysWithoutDuplicates,
      );

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
        }),
      );

      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  test(
    'added unused keys for that deposit was already made',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const { depositData } = signDeposit(pk, sk);
      const { wallet } = await makeDeposit(depositData, providerService);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const keys = [
        { ...mockKey, operatorIndex: mockOperator1.index, used: true },
        {
          ...mockKey,
          operatorIndex: mockOperator2.index,
          used: false,
        },
      ];

      const { curatedModule, sdvtModule } = setupMockModules(
        currentBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        keys,
      );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number - 1,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
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
      // so list of keys can be changed
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
          operatorIds: '0x0000000000000001',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const newBlock = await providerService.provider.getBlock('latest');
      const keysWithoutDuplicates = [
        { ...mockKey, operatorIndex: mockOperator1.index, used: true },
      ];
      setupMockModules(
        newBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        keysWithoutDuplicates,
      );

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
        }),
      );

      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
      expect(sendUnvetMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test('adding not vetted duplicate will not set on soft pause module', async () => {
    const currentBlock = await providerService.provider.getBlock('latest');
    const { depositData } = signDeposit(pk, sk);
    const { wallet } = await makeDeposit(depositData, providerService);

    await depositService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
      },
    });

    const keys = [
      { ...mockKey, operatorIndex: mockOperator1.index, used: false },
      {
        ...mockKey,
        index: mockKey.index + 1,
        operatorIndex: mockOperator1.index,
        used: false,
      },
    ];

    const { curatedModule, sdvtModule } = setupMockModules(
      currentBlock,
      keysApiService,
      [{ ...mockOperator1, stakingLimit: 1 }],
      mockedDvtOperators,
      keys,
    );

    await signingKeyEventsCacheService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number - 2,
        endBlock: currentBlock.number - 1,
        stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
      },
    });

    await depositService.setCachedEvents({
      data: [],
      headers: {
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
      },
    });

    const handleCorrectKeys = jest.spyOn(
      stakingModuleGuardService,
      'handleCorrectKeys',
    );

    const filterModuleNotVettedUnusedKeys = jest.spyOn(
      stakingRouterService,
      'filterModuleNotVettedUnusedKeys',
    );
    await guardianService.handleNewBlock();
    await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

    expect(sendDepositMessage).toBeCalledTimes(2);
    expect(sendDepositMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        blockNumber: currentBlock.number,
        guardianAddress: wallet.address,
        guardianIndex: 7,
        stakingModuleId: curatedModule.id,
      }),
    );
    expect(sendDepositMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        blockNumber: currentBlock.number,
        guardianAddress: wallet.address,
        guardianIndex: 7,
        stakingModuleId: sdvtModule.id,
      }),
    );
    expect(filterModuleNotVettedUnusedKeys).toBeCalledTimes(4);
    expect(filterModuleNotVettedUnusedKeys).toHaveBeenCalledWith(
      NOP_REGISTRY,
      expect.arrayContaining([keys[0]]),
      expect.arrayContaining([keys[1]]),
    );

    //unresolved duplicates
    expect(filterModuleNotVettedUnusedKeys).toHaveBeenCalledWith(
      NOP_REGISTRY,
      expect.arrayContaining([keys[0]]),
      [],
    );
    expect(filterModuleNotVettedUnusedKeys).toHaveBeenCalledWith(
      SIMPLE_DVT,
      [],
      [],
    );
    //unresolved duplicates
    expect(filterModuleNotVettedUnusedKeys).toHaveBeenCalledWith(
      SIMPLE_DVT,
      [],
      [],
    );

    expect(handleCorrectKeys).toBeCalledTimes(2);
    expect(handleCorrectKeys).toHaveBeenCalledWith(
      expect.objectContaining({ duplicatedKeys: [] }),
      expect.anything(),
    );
  });

  test(
    'skip deposits if cannot resolve duplicates',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const { depositData } = signDeposit(pk, sk);
      const { wallet } = await makeDeposit(depositData, providerService);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const unusedKeys = [
        mockKey,
        {
          ...mockKey,
          moduleAddress: SIMPLE_DVT,
        },
      ];

      const { sdvtModule, curatedModule } = setupMockModules(
        currentBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeys,
      );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [mockKeyEvent],
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number - 1,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
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
      const unusedKeysWithoutDuplicates = [
        mockKey,
        {
          ...mockKey2,
          moduleAddress: SIMPLE_DVT,
        },
      ];
      const newBlock = await providerService.provider.getBlock('latest');
      setupMockModules(
        newBlock,
        keysApiService,
        mockedOperators,
        mockedDvtOperators,
        unusedKeysWithoutDuplicates,
      );

      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
        }),
      );

      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
      expect(sendUnvetMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  // TODO: test on unvetting of key of two modules
});
