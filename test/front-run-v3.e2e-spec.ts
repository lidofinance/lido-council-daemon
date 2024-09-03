// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Helpers
import {
  mockedDvtOperators,
  mockedKeysApiFind,
  mockedKeysApiGetAllKeys,
  mockedKeysApiOperatorsMany,
  mockedMeta,
  mockedModule,
  mockedOperators,
  mockOperator1,
  mockOperator2,
  setupMockModules,
} from './helpers';

// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  LIDO_WC,
  BAD_WC,
  CHAIN_ID,
  FORK_BLOCK,
  GANACHE_PORT,
  sk,
  pk,
  NOP_REGISTRY,
  SIMPLE_DVT,
  SANDBOX,
  UNLOCKED_ACCOUNTS,
  CSM,
  SECURITY_MODULE,
} from './constants';

// Contract Factories
import { SecurityAbi__factory } from '../src/generated';

// BLS helpers

// App modules and services
import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';
import { SecurityService } from 'contracts/security';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { GuardianMessageService } from 'guardian/guardian-message';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
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
  let securityService: SecurityService;
  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeyEventsCacheService: SigningKeyEventsCacheService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;

  // method mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

  const setupServer = async () => {
    server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
    await server.listen(GANACHE_PORT);
  };

  const setupGuardians = async () => {
    await addGuardians();
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
      .mockImplementation(() => Promise.resolve(true));
    jest
      .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
      .mockImplementation(() => Promise.resolve(true));

    // mock unvetting method of contract
    // as we dont use real keys api and work with fixtures of operators and keys
    // we cant make real unvetting
    unvetSigningKeys = jest
      .spyOn(securityService, 'unvetSigningKeys')
      .mockImplementation(() => Promise.resolve());
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
      // all keys in keys api on current block state
      const keys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(signature),
          operatorIndex: mockOperator1.index,
          used: false, // TODO: true
          index: 1,
          moduleAddress: NOP_REGISTRY,
        },
        // simple dvt
        mockKey2,
      ];

      // add in deposit cache event of deposit on key with lido creds
      // TODO: replace with real deposit
      await levelDBService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // dont set events for keys as we check this cache only in case of duplicated keys
      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, SANDBOX, CSM],
        },
      });

      // Attempt to front run
      const { depositData: theftDepositData } = signDeposit(pk, sk, BAD_WC);
      const { wallet } = await makeDeposit(theftDepositData, providerService);

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');

      const { curatedModule } = setupMockModules(
        newBlock,
        keysApiService,
        [mockOperator1, mockOperator2],
        mockedDvtOperators,
        keys,
      );

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // soft pause for 1 module, sign deposit for 2
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000001',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);
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

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, SANDBOX, CSM],
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
          operatorIndex: mockOperator1.index,
          used: false, // TODO: true
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
        // simple dvt
        mockKey2,
      ];

      setupMockModules(
        currentBlock,
        keysApiService,
        [mockOperator1, mockOperator2],
        mockedDvtOperators,
        keys,
      );

      // we make check that there are no duplicated used keys
      // this request return keys along with their duplicates
      // mockedKeysApiFind(keysApiService, unusedKeys, newMeta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const securityContract = SecurityAbi__factory.connect(
        SECURITY_MODULE,
        providerService.provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();

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

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, SANDBOX, CSM],
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

      const unusedKeys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSign),
          operatorIndex: mockOperator1.index,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      setupMockModules(
        currentBlock,
        keysApiService,
        [mockOperator1, mockOperator2],
        mockedDvtOperators,
        unusedKeys,
      );

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

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, SANDBOX, CSM],
        },
      });

      const { signature: goodSign, depositData } = signDeposit(
        pk,
        sk,
        LIDO_WC,
        32000000000,
      );

      const { wallet } = await makeDeposit(depositData, providerService);

      const unusedKeys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSign),
          operatorIndex: mockOperator1.index,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      setupMockModules(
        currentBlock,
        keysApiService,
        [mockOperator1, mockOperator2],
        mockedDvtOperators,
        unusedKeys,
      );

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 1,
        }),
      );
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
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

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: stakingModule }],
        meta,
      );

      const unusedKeys = [mockKey];

      const hashWasChanged =
        '0xd921055dbb407e09f64afe5182a64c1bd309fe28f26909a96425cdb6bfc48959';
      const newMeta = mockedMeta(currentBlock, hashWasChanged);
      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test(
    'historical front-run',
    async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await levelDBService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, SANDBOX, CSM],
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
        },
      ];

      setupMockModules(
        currentBlock,
        keysApiService,
        [mockOperator1, mockOperator2],
        mockedDvtOperators,
        keys,
      );

      mockedKeysApiFind(
        keysApiService,
        keys,
        mockedMeta(currentBlock, currentBlock.hash),
      );

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
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendPauseMessage).toBeCalledTimes(1);

      const securityContract = SecurityAbi__factory.connect(
        SECURITY_MODULE,
        providerService.provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();

      expect(isOnPause).toBe(true);
    },
    TESTS_TIMEOUT,
  );
});
