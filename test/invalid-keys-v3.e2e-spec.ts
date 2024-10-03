// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  pk,
  NOP_REGISTRY,
  SIMPLE_DVT,
  FORK_BLOCK,
  SECURITY_MODULE_OWNER,
  CSM,
  SANDBOX,
} from './constants';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { SecurityService } from 'contracts/security';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { GuardianMessageService } from 'guardian/guardian-message';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';

import { getWalletAddress, signDeposit } from './helpers/deposit';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { addGuardians } from './helpers/dsm';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import { mockKey } from './helpers/keys-fixtures';
import { cutKeysCuratedOnachainV1Modules } from './helpers/reduce-keys';
import { JsonRpcBatchProvider } from '@ethersproject/providers';

import * as dockerCompose from 'docker-compose';
import { accountImpersonate, testSetupProvider } from './helpers/provider';

import { waitForNewerBlock, waitForServiceToBeReady } from './helpers/kapi';
import { CuratedOnchainV1 } from './helpers/nor.contract';
import { truncateTables } from './helpers/pg';

describe('ganache e2e tests', () => {
  let server: any;
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let keyValidator: KeyValidatorInterface;
  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeysRegistryService: SigningKeysRegistryService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;
  let securityService: SecurityService;

  // mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let validateKeys: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

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
    signingKeysRegistryService = moduleRef.get(SigningKeysRegistryService);

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
      .spyOn(depositIntegrityCheckerService, 'putEventsToTree')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(depositIntegrityCheckerService, 'checkLatestRoot')
      .mockImplementation(() => Promise.resolve(true));
    jest
      .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
      .mockImplementation(() => Promise.resolve(true));

    // sign validation
    validateKeys = jest.spyOn(keyValidator, 'validateKeys');

    unvetSigningKeys = jest.spyOn(securityService, 'unvetSigningKeys');
  };

  describe('should unvet key', () => {
    let snapshotId: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /status return 200
      await waitForServiceToBeReady();

      await accountImpersonate(SECURITY_MODULE_OWNER);
      await setupGuardians();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);

      setupMocks();
    }, 10000);

    afterAll(async () => {
      // we need to revert after each test because unvetting change only vettedAmount and will not delete key
      await testSetupProvider.send('evm_revert', [snapshotId]);
      // clear db
      // KAPI see that db is empty and update state
      await truncateTables();

      await levelDBService.deleteCache();
      await signKeyLevelDBService.deleteCache();
      await levelDBService.close();
      await signKeyLevelDBService.close();
    });

    test('Set cache to current block', async () => {
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
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
        },
      });
    });

    test('Add key with broken signature', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // TODO: read from locator
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const randomSign =
        '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e';

      await nor.addSigningKey(0, 1, toHexString(pk), randomSign);
      await waitForNewerBlock(currentBlock.number);
    }, 20000);

    test('Unvetted key will not set module on soft pause', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // 4 - number of modules
      expect(validateKeys).toBeCalledTimes(4);
      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(4);
    }, 20000);

    test('Increase staking limit', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20000);

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test(
      'Unvetting',
      async () => {
        const currentBlock = await providerService.provider.getBlock('latest');
        await guardianService.handleNewBlock();
        await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

        const walletAddress = await getWalletAddress();

        // 4 - number of modules
        expect(validateKeys).toBeCalledTimes(8);
        expect(sendUnvetMessage).toBeCalledTimes(1);
        expect(sendUnvetMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            blockNumber: currentBlock.number,
            guardianAddress: walletAddress,
            guardianIndex: 7,
            stakingModuleId: 1,
            operatorIds: '0x0000000000000000',
            vettedKeysByOperator: '0x00000000000000000000000000000003',
          }),
        );

        expect(unvetSigningKeys).toBeCalledTimes(1);
        expect(unvetSigningKeys).toHaveBeenCalledWith(
          expect.anything(),
          currentBlock.number,
          expect.anything(),
          1,
          '0x0000000000000000',
          '0x00000000000000000000000000000003',
          expect.any(Object),
        );
      },
      TESTS_TIMEOUT,
    );

    test('No deposits for module', async () => {
      expect(sendDepositMessage).toBeCalledTimes(7);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });
});

// TODO: maybe move here guardian balance check
