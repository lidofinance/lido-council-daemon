// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Helpers
import {
  mockedKeysApiFind,
  keysApiMockGetAllKeys,
  keysApiMockGetModules,
  mockedModuleCurated,
  mockedModuleDvt,
  mockMeta,
} from './helpers';

// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  STAKING_ROUTER,
  LIDO_WC,
  BAD_WC,
  CHAIN_ID,
  GANACHE_PORT,
  sk,
  pk,
  NOP_REGISTRY,
  SIMPLE_DVT,
  SECURITY_MODULE_V2,
  UNLOCKED_ACCOUNTS_V2,
  FORK_BLOCK_V2,
  SECURITY_MODULE_OWNER_V2,
} from './constants';

// Contract Factories
import { StakingRouterAbi__factory } from './../src/generated';

// BLS helpers

// App modules and services
import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { GuardianMessageService } from 'guardian/guardian-message';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { makeServer } from './server';
import { addGuardians } from './helpers/dsm';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import { BlsService } from 'bls';
import { makeDeposit, signDeposit } from './helpers/deposit';
import { mockKey, mockKey2 } from './helpers/keys-fixtures';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

describe('ganache e2e tests', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeysRegistryService: SigningKeysRegistryService;
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

  const setupMocks = () => {
    // broker messages
    sendDepositMessage = jest
      .spyOn(guardianMessageService, 'sendDepositMessage')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(guardianMessageService, 'pingMessageBroker')
      .mockImplementation(() => Promise.resolve());
    sendPauseMessage = jest
      .spyOn(guardianMessageService, 'sendPauseMessageV2')
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
    'node operator deposit frontrun, 2 modules in staking router',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // create correct sign for deposit message for pk
      const { signature } = signDeposit(pk, sk, LIDO_WC);

      // Keys api mock
      const keys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(signature),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
          vetted: true,
        },
        {
          ...mockKey2,
          index: 0,
          moduleAddress: SIMPLE_DVT,
          operatorIndex: 0,
          vetted: true,
        },
      ];

      // add in deposit cache event of deposit on key with lido creds
      await levelDBService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // dont set events for keys as we check this cache only in case of duplicated keys
      await signingKeysRegistryService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
        },
      });

      // Attempt to front run
      const { depositData: theftDepositData } = signDeposit(pk, sk, BAD_WC);
      const { wallet } = await makeDeposit(theftDepositData, providerService);

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      // setup elBlockSnapshot
      const meta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, meta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // soft pause for 1 module, sign deposit for 2
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  test(
    'failed 1eth deposit attack to stop deposits',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

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

      const { signature: goodSign } = signDeposit(pk, sk, LIDO_WC, 32000000000);

      const { depositData: depositData } = signDeposit(
        pk,
        sk,
        LIDO_WC,
        1000000000,
      );
      await makeDeposit(depositData, providerService, 1);

      // Mock Keys API
      const keys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSign),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
          vetted: true,
        },
        {
          ...mockKey2,
          index: 0,
          moduleAddress: SIMPLE_DVT,
          operatorIndex: 0,
          vetted: true,
        },
      ];

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      // setup elBlockSnapshot
      const meta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, meta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));
      // Check if on pause now
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );

      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(2);
    },
    TESTS_TIMEOUT,
  );

  test(
    'failed 1eth deposit attack to stop deposits with a wrong signature and wc',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

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

      const { signature: goodSign } = signDeposit(pk, sk, LIDO_WC, 32000000000);

      // wrong deposit, fill not set on soft pause deposits
      const { signature: weirdSign } = signDeposit(pk, sk, BAD_WC, 0);
      const { depositData } = signDeposit(pk, sk, BAD_WC, 1000000000);
      await makeDeposit(
        { ...depositData, signature: weirdSign },
        providerService,
        1,
      );

      const keys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSign),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
          vetted: true,
        },
      ];

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      // setup elBlockSnapshot
      const meta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, meta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(2);
    },
    TESTS_TIMEOUT,
  );

  test(
    'good scenario',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

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

      const { signature: goodSign, depositData } = signDeposit(
        pk,
        sk,
        LIDO_WC,
        32000000000,
      );

      const { wallet } = await makeDeposit(depositData, providerService);

      const keys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSign),
          operatorIndex: 0,
          used: true,
          index: 0,
          moduleAddress: NOP_REGISTRY,
          vetted: true,
        },
      ];

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      // setup elBlockSnapshot
      const meta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, meta);

      // Check if the service is ok and ready to go
      // the same scenario as "failed 1eth deposit attack to stop deposits"
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,

          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );

      // Check if on pause now
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);
      const isOnPause2 = await routerContract.getStakingModuleIsDepositsPaused(
        2,
      );
      expect(isOnPause2).toBe(false);
    },
    TESTS_TIMEOUT,
  );

  test(
    'inconsistent kapi requests data',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await levelDBService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      const keys = [mockKey];

      // Mock Keys API
      // setup elBlockSnapshot
      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockMeta(newBlock, newBlock.hash);
      keysApiMockGetAllKeys(keysApiService, keys, newMeta);

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test(
    'frontrun of unvetted key will not set module on soft pause',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

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

      const { signature: goodSign } = signDeposit(pk, sk, LIDO_WC, 32000000000);

      const { depositData: theftDepositData } = signDeposit(pk, sk, BAD_WC);
      const { wallet } = await makeDeposit(theftDepositData, providerService);

      const unvettedKeys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSign),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
          vetted: false,
        },
      ];

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      // setup elBlockSnapshot
      const meta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, unvettedKeys, meta);

      // Check if the service is ok and ready to go
      // the same scenario as "failed 1eth deposit attack to stop deposits"
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);

      // Check if on pause now
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);
    },
    TESTS_TIMEOUT,
  );

  test(
    'historical front-run',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await signingKeysRegistryService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
        },
      });

      const { signature: lidoSign } = signDeposit(pk, sk);
      const { signature: theftDepositSign } = signDeposit(pk, sk, BAD_WC);

      const keys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(lidoSign),
          operatorIndex: 0,
          used: true,
          index: 0,
          moduleAddress: NOP_REGISTRY,
          vetted: true,
        },
      ];

      await levelDBService.setCachedEvents({
        data: [
          {
            valid: true,
            pubkey: toHexString(pk),
            amount: '32000000000',
            wc: BAD_WC,
            signature: toHexString(theftDepositSign),
            tx: '0x122',
            blockHash: '0x123456',
            blockNumber: currentBlock.number - 1,
            logIndex: 1,
            depositCount: 1,
            depositDataRoot: new Uint8Array(),
            index: '',
          },
          {
            valid: true,
            pubkey: toHexString(pk),
            amount: '32000000000',
            wc: LIDO_WC,
            signature: toHexString(lidoSign),
            tx: '0x123',
            blockHash: currentBlock.hash,
            blockNumber: currentBlock.number,
            logIndex: 1,
            depositCount: 2,
            depositDataRoot: new Uint8Array(),
            index: '',
          },
        ],
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number,
        },
      });

      // setup elBlockSnapshot
      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, meta);
      mockedKeysApiFind(keysApiService, keys, meta);

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );

      expect(isOnPause).toBe(true);

      const isOnPause2Module =
        await routerContract.getStakingModuleIsDepositsPaused(2);

      expect(isOnPause2Module).toBe(false);
      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(1);

      // Mine a new block
      await providerService.provider.send('evm_mine', []);

      // // Your assertions after mining the block
      const newBlock = await providerService.provider.getBlock('latest');

      // setup elBlockSnapshot
      const newMeta = mockMeta(newBlock, newBlock.hash);
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, newMeta);
      mockedKeysApiFind(keysApiService, keys, newMeta);

      sendPauseMessage.mockClear();

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const isOnPause1NextIter =
        await routerContract.getStakingModuleIsDepositsPaused(1);

      expect(isOnPause1NextIter).toBe(true);

      const isOnPause2NextIter =
        await routerContract.getStakingModuleIsDepositsPaused(2);

      expect(isOnPause2NextIter).toBe(true);

      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(1);
    },
    TESTS_TIMEOUT,
  );
});
