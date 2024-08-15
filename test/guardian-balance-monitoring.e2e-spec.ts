// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Helpers
import {
  mockedDvtOperators,
  mockOperator1,
  mockOperator2,
  setupMockModules,
} from './helpers';

// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  CHAIN_ID,
  GANACHE_PORT,
  sk,
  pk,
  NOP_REGISTRY,
  SIMPLE_DVT,
  SANDBOX,
  LIDO_WC,
  UNLOCKED_ACCOUNTS,
  FORK_BLOCK,
  CSM,
} from './constants';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';
import { SecurityService } from 'contracts/security';
import { DepositService } from 'contracts/deposit';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { GuardianMessageService } from 'guardian/guardian-message';
import { LevelDBService } from 'contracts/deposit/leveldb';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';
import { makeDeposit, signDeposit } from './helpers/deposit';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
import { addGuardians, setGuardianBalance } from './helpers/dsm';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from 'contracts/deposit/integrity-checker';
import { makeServer } from './server';
import { mockKey, mockKey2 } from './helpers/keys-fixtures';

describe('ganache e2e tests', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let depositService: DepositService;
  let keyValidator: KeyValidatorInterface;
  let levelDBService: LevelDBService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeyEventsCacheService: SigningKeyEventsCacheService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;
  let securityService: SecurityService;

  // mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let validateKeys: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

  const setupServer = async () => {
    server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
    await server.listen(GANACHE_PORT);
  };

  const setupGuardians = async () => {
    await addGuardians();
  };

  const setupDefaultCache = async (blockNumber) => {
    await depositService.setCachedEvents({
      data: [],
      headers: {
        startBlock: blockNumber,
        endBlock: blockNumber,
      },
    });

    await signingKeyEventsCacheService.setCachedEvents({
      data: [],
      headers: {
        startBlock: blockNumber,
        endBlock: blockNumber,
        stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, SANDBOX, CSM],
      },
    });
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

    // sign validation
    keyValidator = moduleRef.get(KeyValidatorInterface);
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

    // sign validation
    validateKeys = jest.spyOn(keyValidator, 'validateKeys');

    // mock unvetting method of contract
    // as we dont use real keys api and work with fixtures of operators and keys
    // we cant make real unvetting
    unvetSigningKeys = jest
      .spyOn(securityService, 'unvetSigningKeys')
      .mockImplementation(() => Promise.resolve());
  };

  // reason for unvetting
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

  describe('should check unvetting will not happen if guardian balance lower critical threshold', () => {
    test('should send metric for unvetting to data bus', async () => {
      await setGuardianBalance('0.2');
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const currentBlock = await providerService.getBlock();
      // // setup cache
      await setupDefaultCache(currentBlock.number);
      setupKAPIWithInvalidSignProblem(currentBlock);

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(unvetSigningKeys).toBeCalledTimes(0);
      // data bus messages
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledTimes(0);

      // at next iteration it should unvet keys of second module
    });
  });
});
