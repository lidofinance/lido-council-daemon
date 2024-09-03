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
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { GuardianMessageService } from 'guardian/guardian-message';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';
import { makeDeposit, signDeposit } from './helpers/deposit';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
import { addGuardians } from './helpers/dsm';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import { makeServer } from './server';
import { mockKey } from './helpers/keys-fixtures';

describe('ganache e2e tests', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let keyValidator: KeyValidatorInterface;
  let levelDBService: DepositsRegistryStoreService;
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
      .mockImplementation(() => Promise.resolve(true));
    jest
      .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
      .mockImplementation(() => Promise.resolve(true));

    // sign validation
    validateKeys = jest.spyOn(keyValidator, 'validateKeys');

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
    'should not validate again if depositData was not changed',
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

      const keyWithWrongSign = {
        key: toHexString(pk),
        // just some random sign
        depositSignature:
          '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
        operatorIndex: 0,
        used: false,
        index: 0,
        moduleAddress: NOP_REGISTRY,
      };

      const { curatedModule, sdvtModule } = setupMockModules(
        currentBlock,
        keysApiService,
        [mockOperator1, mockOperator2],
        mockedDvtOperators,
        [keyWithWrongSign],
      );
      const { depositData: depositData } = signDeposit(pk, sk, LIDO_WC);
      const { wallet } = await makeDeposit(depositData, providerService);

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(validateKeys).toBeCalledTimes(2);
      expect(validateKeys).toHaveBeenNthCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({
            key: toHexString(pk),
            // just some random sign
            depositSignature:
              '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
          }),
        ]),
      );
      expect(validateKeys).toHaveBeenNthCalledWith(2, []);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);

      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);

      // if depositData was not changed it will not validate again

      const newBlock = await providerService.provider.getBlock('latest');
      setupMockModules(
        newBlock,
        keysApiService,
        [mockOperator1, mockOperator2],
        mockedDvtOperators,
        [keyWithWrongSign],
      );

      validateKeys.mockClear();
      sendDepositMessage.mockClear();
      sendUnvetMessage.mockClear();
      unvetSigningKeys.mockClear();

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(validateKeys).toBeCalledTimes(2);
      // don't validate again
      expect(validateKeys).toHaveBeenNthCalledWith(1, []);
      expect(validateKeys).toHaveBeenNthCalledWith(2, []);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: curatedModule.id,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);

      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 7,
          stakingModuleId: sdvtModule.id,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test('should validate again if deposit data was changed', async () => {
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

    const keyWithWrongSign = {
      key: toHexString(pk),
      // just some random sign
      depositSignature:
        '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
      operatorIndex: 0,
      used: false,
      index: 0,
      moduleAddress: NOP_REGISTRY,
    };

    const dvtKey = {
      ...mockKey,
      moduleAddress: SIMPLE_DVT,
    };

    const { curatedModule, sdvtModule } = setupMockModules(
      currentBlock,
      keysApiService,
      [mockOperator1, mockOperator2],
      mockedDvtOperators,
      [keyWithWrongSign, dvtKey],
    );

    await guardianService.handleNewBlock();

    await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

    const { depositData: depositData, signature: lidoSign } = signDeposit(
      pk,
      sk,
      LIDO_WC,
    );
    const { wallet } = await makeDeposit(depositData, providerService);

    expect(validateKeys).toBeCalledTimes(2);
    expect(validateKeys).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          key: toHexString(pk),
          // just some random sign
          depositSignature:
            '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
        }),
      ]),
    );
    expect(validateKeys).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({
          key: mockKey.key,
          depositSignature: mockKey.depositSignature,
        }),
      ]),
    );
    expect(sendUnvetMessage).toBeCalledTimes(1);
    expect(sendUnvetMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        blockNumber: currentBlock.number,
        guardianAddress: wallet.address,
        guardianIndex: 7,
        stakingModuleId: curatedModule.id,
        operatorIds: '0x0000000000000000',
        vettedKeysByOperator: '0x00000000000000000000000000000000',
      }),
    );
    expect(unvetSigningKeys).toBeCalledTimes(1);
    expect(sendDepositMessage).toBeCalledTimes(1);
    expect(sendDepositMessage).toBeCalledWith(
      expect.objectContaining({
        blockNumber: currentBlock.number,
        guardianAddress: wallet.address,
        guardianIndex: 7,
        stakingModuleId: sdvtModule.id,
      }),
    );
    expect(sendPauseMessage).toBeCalledTimes(0);

    const newBlock = await providerService.provider.getBlock('latest');

    const fixedKey = {
      ...keyWithWrongSign,
      depositSignature: toHexString(lidoSign),
    };

    setupMockModules(
      newBlock,
      keysApiService,
      [mockOperator1, mockOperator2],
      mockedDvtOperators,
      [fixedKey, dvtKey],
    );

    validateKeys.mockClear();
    sendDepositMessage.mockClear();
    sendUnvetMessage.mockClear();
    unvetSigningKeys.mockClear();

    await guardianService.handleNewBlock();
    await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

    expect(validateKeys).toBeCalledTimes(2);
    expect(validateKeys).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          key: toHexString(pk),
          depositSignature: toHexString(lidoSign),
        }),
      ]),
    );
    expect(validateKeys).toHaveBeenNthCalledWith(2, []);
    expect(sendDepositMessage).toBeCalledTimes(2);
    expect(sendDepositMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        blockNumber: newBlock.number,
        guardianAddress: wallet.address,
        guardianIndex: 7,
        stakingModuleId: curatedModule.id,
      }),
    );
    expect(sendDepositMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        blockNumber: newBlock.number,
        guardianAddress: wallet.address,
        guardianIndex: 7,
        stakingModuleId: sdvtModule.id,
      }),
    );

    expect(sendPauseMessage).toBeCalledTimes(0);
  });
});
