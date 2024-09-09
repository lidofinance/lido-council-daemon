// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Helpers
import {
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
  CHAIN_ID,
  GANACHE_PORT,
  sk,
  pk,
  NOP_REGISTRY,
  SIMPLE_DVT,
  LIDO_WC,
  FORK_BLOCK_V2,
  UNLOCKED_ACCOUNTS_V2,
  SECURITY_MODULE_V2,
  SECURITY_MODULE_OWNER_V2,
} from './constants';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';
import { DepositService } from 'contracts/deposit';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { GuardianMessageService } from 'guardian/guardian-message';
import { LevelDBService } from 'contracts/deposit/leveldb';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';
import { getWalletAddress, makeDeposit, signDeposit } from './helpers/deposit';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
import { addGuardians } from './helpers/dsm';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from 'contracts/deposit/integrity-checker';
import { makeServer } from './server';
import { mockKey } from './helpers/keys-fixtures';

describe('ganache e2e tests', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let depositService: DepositService;
  let keyValidator: KeyValidatorInterface;
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let validateKeys: jest.SpyInstance;
  let levelDBService: LevelDBService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeyEventsCacheService: SigningKeyEventsCacheService;
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

    // deposit cache mocks
    jest
      .spyOn(depositIntegrityCheckerService, 'checkLatestRoot')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
      .mockImplementation(() => Promise.resolve());

    // sign validation
    validateKeys = jest.spyOn(keyValidator, 'validateKeys');
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

      await depositService.setCachedEvents({
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
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
        },
      });

      // const { depositData: depositData } = signDeposit(pk, sk, LIDO_WC);
      const walletAddress = await getWalletAddress();

      const keyWithWrongSign = {
        key: toHexString(pk),
        // just some random sign
        depositSignature:
          '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
        operatorIndex: 0,
        used: false,
        index: 0,
        moduleAddress: NOP_REGISTRY,
        vetted: true,
      };

      const keys = [keyWithWrongSign];
      const meta = mockMeta(currentBlock, currentBlock.hash);
      // setup /v1/modules
      const stakingModules = [mockedModuleCurated, mockedModuleDvt];
      keysApiMockGetModules(keysApiService, stakingModules, meta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, meta);

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

      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);

      // if depositData was not changed it will not validate again
      await providerService.provider.send('evm_mine', []);
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockMeta(newBlock, newBlock.hash);
      // setup /v1/modules
      keysApiMockGetModules(keysApiService, stakingModules, newMeta);
      // setup /v1/keys
      keysApiMockGetAllKeys(keysApiService, keys, newMeta);

      validateKeys.mockClear();
      sendDepositMessage.mockClear();

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(validateKeys).toBeCalledTimes(2);
      // dont validate again
      expect(validateKeys).toHaveBeenNthCalledWith(1, []);
      expect(validateKeys).toHaveBeenNthCalledWith(2, []);
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: 7,
          stakingModuleId: 2,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test('should validate again if deposit data was changed', async () => {
    const currentBlock = await providerService.provider.getBlock('latest');

    await depositService.setCachedEvents({
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
        stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT],
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
      vetted: true,
    };

    const dvtKey = {
      ...mockKey,
      moduleAddress: SIMPLE_DVT,
      vetted: true,
    };

    const keys = [keyWithWrongSign, dvtKey];
    const meta = mockMeta(currentBlock, currentBlock.hash);
    // setup /v1/modules
    const stakingModules = [mockedModuleCurated, mockedModuleDvt];
    keysApiMockGetModules(keysApiService, stakingModules, meta);
    // setup /v1/keys
    keysApiMockGetAllKeys(keysApiService, keys, meta);

    await guardianService.handleNewBlock();

    await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

    const { signature: lidoSign } = signDeposit(pk, sk, LIDO_WC);
    const walletAddress = await getWalletAddress();

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
          key: dvtKey.key,
          depositSignature: dvtKey.depositSignature,
        }),
      ]),
    );
    expect(sendDepositMessage).toBeCalledTimes(1);
    expect(sendDepositMessage).toBeCalledWith(
      expect.objectContaining({
        blockNumber: currentBlock.number,
        guardianAddress: walletAddress,
        guardianIndex: 7,
        stakingModuleId: 2,
      }),
    );
    expect(sendPauseMessage).toBeCalledTimes(0);

    const fixedKey = {
      ...keyWithWrongSign,
      depositSignature: toHexString(lidoSign),
    };

    const fixedKeys = [fixedKey, dvtKey];
    await providerService.provider.send('evm_mine', []);
    const newBlock = await providerService.provider.getBlock('latest');

    const newMeta = mockMeta(newBlock, newBlock.hash);
    // setup /v1/modules
    keysApiMockGetModules(keysApiService, stakingModules, newMeta);
    // setup /v1/keys
    keysApiMockGetAllKeys(keysApiService, fixedKeys, newMeta);

    validateKeys.mockClear();
    sendDepositMessage.mockClear();

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
        guardianAddress: walletAddress,
        guardianIndex: 7,
        stakingModuleId: 1,
      }),
    );
    expect(sendDepositMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        blockNumber: newBlock.number,
        guardianAddress: walletAddress,
        guardianIndex: 7,
        stakingModuleId: 2,
      }),
    );

    expect(sendPauseMessage).toBeCalledTimes(0);
  });
});
