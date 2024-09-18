// Mocking and Setup
jest.mock('../src/transport/stomp/stomp.client.ts');
jest.setTimeout(10_000);

// External Libraries
import { Server } from 'ganache';

// Helper Functions and Mocks
import {
  mockedDvtOperators,
  mockOperator1,
  mockOperator2,
  setupMockModules,
} from './helpers';

import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';

import { makeServer } from './server';

// Constants
import {
  SLEEP_FOR_RESULT,
  CHAIN_ID,
  GANACHE_PORT,
  NOP_REGISTRY,
  SIMPLE_DVT,
  UNLOCKED_ACCOUNTS,
  FORK_BLOCK,
} from './constants';

// Contract and Service Imports
import { SecurityService } from 'contracts/security';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { GuardianMessageService } from 'guardian/guardian-message';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';

// Test Data
import { mockKey, mockKey2 } from './helpers/keys-fixtures';
import { addGuardians, setGuardianBalance } from './helpers/dsm';

describe('Guardian balance monitoring test', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeysRegistryService: SigningKeysRegistryService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;
  let securityService: SecurityService;

  // mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

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

  test('should check unvetting will not happen if guardian balance lower critical threshold', async () => {
    await setBalance('0.2');

    const currentBlock = await providerService.getBlock();
    await setupDefaultCache(currentBlock.number);
    setupKAPIWithInvalidSignProblem(currentBlock);

    await guardianService.handleNewBlock();
    await waitForProcessing();

    expect(unvetSigningKeys).toBeCalledTimes(0);
    expect(sendUnvetMessage).toBeCalledTimes(1);
    expect(sendDepositMessage).toBeCalledTimes(0);

    // at next iteration it should unvet keys of second module
  });

  test('should check unvetting will happen if guardian balance is sufficient', async () => {
    await setBalance('1');

    const currentBlock = await providerService.getBlock();
    await setupDefaultCache(currentBlock.number);
    setupKAPIWithInvalidSignProblem(currentBlock);

    await guardianService.handleNewBlock();
    await waitForProcessing();

    expect(unvetSigningKeys).toBeCalledTimes(1);
    expect(sendUnvetMessage).toBeCalledTimes(1);
    expect(sendDepositMessage).toBeCalledTimes(0);

    // at next iteration it should unvet keys of second module
  });

  // Helper functions

  async function setBalance(eth: string) {
    await setGuardianBalance(eth);
    await waitForProcessing();
  }

  const setupDefaultCache = async (blockNumber) => {
    await levelDBService.setCachedEvents({
      data: [],
      headers: {
        startBlock: blockNumber,
        endBlock: blockNumber,
      },
    });

    await signingKeysRegistryService.setCachedEvents({
      data: [],
      headers: {
        startBlock: blockNumber,
        endBlock: blockNumber,
        stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
      },
    });
  };

  const setupKAPIWithInvalidSignProblem = (block) => {
    const norKeyWithWrongSign = {
      ...mockKey,
      depositSignature:
        '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
    };

    const dvtKey = {
      ...mockKey2,
      used: false,
      operatorIndex: mockedDvtOperators[0].index,
      moduleAddress: SIMPLE_DVT,
    };

    setupMockModules(
      block,
      keysApiService,
      [mockOperator1, mockOperator2],
      mockedDvtOperators,
      [norKeyWithWrongSign, dvtKey, { ...dvtKey, index: dvtKey.index + 1 }],
    );
  };

  async function waitForProcessing() {
    await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));
  }

  const setupServer = async () => {
    server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
    await server.listen(GANACHE_PORT);
  };

  const setupGuardians = async () => {
    await addGuardians();
  };

  const setupTestingServices = async (moduleRef) => {
    await initializeLevelDBServices(moduleRef);
    initializeDepositServices(moduleRef);
    await initializeBlsService(moduleRef);
    initializeKeyEventServices(moduleRef);
    initializeProviders(moduleRef);
    initializeMessagingServices(moduleRef);
    initializeGuardianService(moduleRef);
  };

  const initializeLevelDBServices = async (moduleRef) => {
    levelDBService = moduleRef.get(DepositsRegistryStoreService);
    signKeyLevelDBService = moduleRef.get(SignKeyLevelDBService);
    await initLevelDB(levelDBService, signKeyLevelDBService);
  };

  const initializeDepositServices = (moduleRef) => {
    depositIntegrityCheckerService = moduleRef.get(
      DepositIntegrityCheckerService,
    );
  };

  const initializeKeyEventServices = (moduleRef) => {
    signingKeysRegistryService = moduleRef.get(SigningKeysRegistryService);
  };

  const initializeProviders = (moduleRef) => {
    providerService = moduleRef.get(ProviderService);
    securityService = moduleRef.get(SecurityService);
    keysApiService = moduleRef.get(KeysApiService);
  };

  const initializeMessagingServices = (moduleRef) => {
    guardianMessageService = moduleRef.get(GuardianMessageService);
  };

  const initializeBlsService = async (moduleRef) => {
    const blsService = moduleRef.get(BlsService);
    await blsService.onModuleInit();
  };

  const initializeGuardianService = (moduleRef) => {
    guardianService = moduleRef.get(GuardianService);
  };

  const setupMocks = () => {
    mockBrokerMessages();
    mockDepositCacheMethods();
    mockUnvettingMethod();
  };

  const mockBrokerMessages = () => {
    sendDepositMessage = jest
      .spyOn(guardianMessageService, 'sendDepositMessage')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(guardianMessageService, 'pingMessageBroker')
      .mockImplementation(() => Promise.resolve());
    sendUnvetMessage = jest
      .spyOn(guardianMessageService, 'sendUnvetMessage')
      .mockImplementation(() => Promise.resolve());
  };

  const mockDepositCacheMethods = () => {
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

  const mockUnvettingMethod = () => {
    unvetSigningKeys = jest
      .spyOn(securityService, 'unvetSigningKeys')
      .mockImplementation(() => Promise.resolve(null as any));
  };
});
