// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Constants
import { SLEEP_FOR_RESULT, pk } from './constants';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { SecurityService } from 'contracts/security';
import { GuardianService } from 'guardian';
import { ProviderService } from 'provider';
import { GuardianMessageService } from 'guardian/guardian-message';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';

import { getWalletAddress } from './helpers/deposit';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import {
  addGuardians,
  getGuardians,
  getLidoWC,
  getSecurityContract,
  getSecurityOwner,
} from './helpers/dsm';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import { accountImpersonate, testSetupProvider } from './helpers/provider';
import { waitForNewerBlock, waitKAPIUpdateModulesKeys } from './helpers/kapi';
import { CuratedOnchainV1 } from './helpers/nor.contract';
import { truncateTables } from './helpers/pg';
import { packNodeOperatorIds } from 'guardian/unvetting/bytes';
import { getStakingModulesInfo } from './helpers/sr.contract';
import { HardhatServer } from './helpers/hardhat-server';
import {
  setupContainers,
  startContainerIfNotRunning,
} from './helpers/docker-containers/utils';
import { cutModulesKeys } from './helpers/reduce-keys';

jest.setTimeout(100_000);

describe('Signature validation e2e test', () => {
  let providerService: ProviderService;
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
  let validateKeys: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

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

  let stakingModulesAddresses: string[];
  let curatedModuleAddress: string;
  let stakingModulesCount: number;
  let firstOperator: any;
  let nor: CuratedOnchainV1;
  const frontrunPK: Uint8Array = pk;
  let guardianIndex: number;
  let postgresContainer;
  let keysApiContainer;
  let hardhatServer: HardhatServer;

  beforeAll(async () => {
    const { kapi, psql } = await setupContainers();
    keysApiContainer = kapi;
    postgresContainer = psql;

    await startContainerIfNotRunning(postgresContainer);
    hardhatServer = new HardhatServer();
    await hardhatServer.start();

    console.log('Hardhat node is ready. Starting key cutting process...');
    await cutModulesKeys();

    await startContainerIfNotRunning(keysApiContainer);

    await waitKAPIUpdateModulesKeys();

    const securityModule = await getSecurityContract();
    const securityModuleOwner = await getSecurityOwner();

    // can remove
    await accountImpersonate(securityModuleOwner);
    const oldGuardians = await getGuardians();
    const securityModuleAddress = securityModule.address;
    await addGuardians({
      securityModuleAddress,
      securityModuleOwner,
    });

    const newGuardians = await getGuardians();
    // TODO: read from contract
    guardianIndex = newGuardians.length - 1;
    expect(newGuardians.length).toEqual(oldGuardians.length + 1);

    ({ stakingModulesAddresses, curatedModuleAddress } =
      await getStakingModulesInfo());
    stakingModulesCount = stakingModulesAddresses.length;

    // get two different active operators
    nor = new CuratedOnchainV1(curatedModuleAddress);
    const activeOperators = await nor.getActiveOperators();
    firstOperator = activeOperators[0];
    // create duplicate
    await getLidoWC();
  }, 120_000);

  afterAll(async () => {
    await keysApiContainer.stop();
    await hardhatServer.stop();
    await postgresContainer.stop();
  });

  describe('Signature validation', () => {
    let snapshotId: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      await waitKAPIUpdateModulesKeys();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);
      setupMocks();
    }, 50_000);

    afterAll(async () => {
      jest.clearAllMocks();
      await testSetupProvider.send('evm_revert', [snapshotId]);
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
          stakingModulesAddresses,
        },
      });
    });

    test('Add key with broken signature', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const randomSign =
        '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e';

      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(frontrunPK),
        randomSign,
        firstOperator.rewardAddress,
      );
      await waitForNewerBlock(currentBlock.number);
    });

    test('Unvetted key will not set module on soft pause', async () => {
      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // 4 - number of modules
      expect(validateKeys).toBeCalledTimes(stakingModulesCount);
      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    });

    test('Increase staking limit', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Unvetting', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const walletAddress = await getWalletAddress();

      // 4 - number of modules
      expect(validateKeys).toBeCalledTimes(2 * stakingModulesCount);
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex,
          stakingModuleId: 1,
          operatorIds: packNodeOperatorIds([firstOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([firstOperator.index]),
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    });

    test('No deposits for module', async () => {
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount - 1);
    });

    test('Check staking limit for operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });
});
