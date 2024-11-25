// Constants
import { SLEEP_FOR_RESULT, pk, sk } from './constants';
import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { getWalletAddress, signDeposit } from './helpers/deposit';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { ProviderService } from 'provider';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SecurityService } from 'contracts/security';
import { GuardianMessageService } from 'guardian/guardian-message';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
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
import { truncateTables } from './helpers/pg';
import { CuratedOnchainV1 } from './helpers/nor.contract';
import { toHexString } from 'contracts/deposits-registry/crypto';
import { getStakingModulesInfo } from './helpers/sr.contract';
import { SecretKey } from '@chainsafe/blst';
import { packNodeOperatorIds } from 'guardian/unvetting/bytes';
import { HardhatServer } from './helpers/hardhat-server';
import {
  setupContainers,
  startContainerIfNotRunning,
} from './helpers/docker-containers/utils';
import { cutModulesKeys } from './helpers/reduce-keys';

jest.mock('../src/transport/stomp/stomp.client.ts');
jest.setTimeout(100_000);

describe('Duplicates e2e tests', () => {
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let securityService: SecurityService;

  let levelDBService: DepositsRegistryStoreService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;

  let signKeyLevelDBService: SignKeyLevelDBService;
  let signingKeysRegistryService: SigningKeysRegistryService;

  let guardianMessageService: GuardianMessageService;
  // methods mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

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

    unvetSigningKeys = jest.spyOn(securityService, 'unvetSigningKeys');
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
  };

  let stakingModulesAddresses: string[];
  let curatedModuleAddress: string;
  let sdvtModuleAddress: string;
  let stakingModulesCount: number;
  let curatedFirstOperator: any;
  let curatedSecondOperator: any;
  let sdvtOperator: any;
  let nor: CuratedOnchainV1;
  let sdvt: CuratedOnchainV1;
  const duplicatePK: Uint8Array = pk;
  const duplicateSK: SecretKey = sk;
  let duplicateDepositSignature: Uint8Array;
  let guardianIndex: number;
  let lidoWC: string;

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
    await accountImpersonate(securityModuleOwner);
    const oldGuardians = await getGuardians();
    await addGuardians({
      securityModuleAddress: securityModule.address,
      securityModuleOwner,
    });
    const newGuardians = await getGuardians();
    // TODO: read from contract by address
    guardianIndex = newGuardians.length - 1;
    expect(newGuardians.length).toEqual(oldGuardians.length + 1);

    ({ stakingModulesAddresses, curatedModuleAddress, sdvtModuleAddress } =
      await getStakingModulesInfo());

    stakingModulesCount = stakingModulesAddresses.length;

    // get two different active operators
    nor = new CuratedOnchainV1(curatedModuleAddress);
    sdvt = new CuratedOnchainV1(sdvtModuleAddress);

    const curatedActiveOperators = await nor.getActiveOperators();
    const sdvtActiveOperators = await sdvt.getActiveOperators();
    curatedFirstOperator = curatedActiveOperators[0];
    curatedSecondOperator = curatedActiveOperators[1];
    sdvtOperator = sdvtActiveOperators[0];

    // create duplicate
    lidoWC = await getLidoWC();
    const { signature } = await signDeposit(duplicatePK, duplicateSK, lidoWC);
    duplicateDepositSignature = signature;
  }, 200_000);

  afterAll(async () => {
    await keysApiContainer.stop();
    await hardhatServer.stop();
    await postgresContainer.stop();
  });

  describe('Duplicated key across operators of one modules', () => {
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

    test('add unused unvetted key to first operator of the first module', async () => {
      // 1 module is Curated v1 onchain
      const currentBlock = await providerService.provider.getBlock('latest');

      await nor.addSigningKey(
        curatedFirstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        curatedFirstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('add duplicate key to first operator of the first module', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await nor.addSigningKey(
        curatedSecondOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        curatedSecondOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('no unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    });

    test('increase staking limit for the first operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      // as modules have the same amount of keys
      await nor.setStakingLimit(curatedFirstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('no unvetting after staking limit increase for the first operator', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(unvetSigningKeys).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      // second iteration of deposits
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount * 2);
    });

    test('increase staking limit for the second operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(curatedSecondOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator before unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await nor.getOperator(curatedSecondOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('unvetting happen', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await guardianService.handleNewBlock();
      await waitForNewerBlock(currentBlock.number);

      const walletAddress = await getWalletAddress();

      // unvetting for second module
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: guardianIndex,
          stakingModuleId: 1,
          operatorIds: packNodeOperatorIds([curatedSecondOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([curatedSecondOperator.index]),
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    }, 60_000);

    test('no deposits for module', async () => {
      // 8 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(
        stakingModulesCount * 2 + stakingModulesCount - 1,
      );
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const op = await nor.getOperator(curatedSecondOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Duplicate created for already deposited key', () => {
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

    test('Add unused unvetted key for the first operator of the first module', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // TODO: better to create new key, deposit it and than create duplicaate on it
      // as 0 key of operator is not necessary should be deposited
      const {
        data: { keys },
      } = await keysApiService.getModuleKeys(1, 0);

      const publicKey = keys[0].key;
      const depositSignature = keys[0].depositSignature;

      await nor.addSigningKey(
        curatedFirstOperator.index,
        1,
        publicKey,
        depositSignature,
        curatedFirstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('No unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('Deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    });

    test('Increase staking limit for the first operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(curatedFirstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Unvetting happen for first operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await guardianService.handleNewBlock();
      await waitForNewerBlock(currentBlock.number);
      const walletAddress = await getWalletAddress();

      // unvetting for second module
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: guardianIndex,
          stakingModuleId: 1,
          operatorIds: packNodeOperatorIds([curatedFirstOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([curatedFirstOperator.index]),
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    });

    test('no deposits for module', async () => {
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount - 1);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Duplicated key one operator of one modules', () => {
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

    test('Add unused unvetted duplicated key to first operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await nor.addSigningKey(
        curatedFirstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        curatedFirstOperator.rewardAddress,
      );

      await nor.addSigningKey(
        curatedFirstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        curatedFirstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('No unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('Deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    });

    test('Increase staking limit for the first operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 5
      await nor.setStakingLimit(curatedFirstOperator.index, 5);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(5);
    });

    test('Unvetting happen', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await guardianService.handleNewBlock();

      await waitForNewerBlock(currentBlock.number);

      const walletAddress = await getWalletAddress();

      // unvetting for second module
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: guardianIndex,
          stakingModuleId: 1,
          operatorIds: packNodeOperatorIds([curatedFirstOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000004',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([curatedFirstOperator.index]),
        '0x00000000000000000000000000000004',
        expect.any(Object),
      );
    });

    test('No deposits for module', async () => {
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount - 1);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });

  describe('Duplicated key across operators of two modules', () => {
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

    test('add unused unvetted key to the first operator of the NOR contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await nor.addSigningKey(
        curatedFirstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        curatedFirstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('add duplicate key to the first operator of the SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await sdvt.addSigningKey(
        sdvtOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        sdvtOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('no unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    });

    test('increase staking limit for op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(curatedFirstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('no unvetting after staking limit increase for 0 operator of NOR contract', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(unvetSigningKeys).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount);
    });

    test('increase staking limit for the first operator of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await sdvt.setStakingLimit(sdvtOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator before unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await sdvt.getOperator(sdvtOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('unvetting happen', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await guardianService.handleNewBlock();
      await waitForNewerBlock(currentBlock.number);

      const walletAddress = await getWalletAddress();

      // unvetting for second module
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex: guardianIndex,
          stakingModuleId: 2,
          operatorIds: packNodeOperatorIds([sdvtOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        2,
        packNodeOperatorIds([sdvtOperator.index]),
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    });

    test('no deposits for module', async () => {
      expect(sendDepositMessage).toBeCalledTimes(3 * stakingModulesCount - 1);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const op = await sdvt.getOperator(sdvtOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Unvetting in two modules', () => {
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

    test('add unused unvetted key to op = 0 of nor contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // add two keys
      // key with smaller index will be considered across one operator as original
      await nor.addSigningKey(
        curatedFirstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        curatedFirstOperator.rewardAddress,
      );
      await nor.addSigningKey(
        curatedFirstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        curatedFirstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('add duplicate key to op = 0 of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await sdvt.addSigningKey(
        sdvtOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        sdvtOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('no unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    });

    test('increase staking limit for op = 0 of NOR contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(curatedFirstOperator.index, 5);
      await waitForNewerBlock(currentBlock.number);
    });

    test('increase staking limit for op = 0 of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await sdvt.setStakingLimit(sdvtOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator before unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(5);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await sdvt.getOperator(sdvtOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('unvetting happen in first module', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await guardianService.handleNewBlock();
      await waitForNewerBlock(currentBlock.number);

      const walletAddress = await getWalletAddress();

      // unvetting for second module
      expect(sendUnvetMessage).toBeCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex,
          stakingModuleId: 1,
          operatorIds: packNodeOperatorIds([curatedFirstOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000004',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([curatedFirstOperator.index]),
        '0x00000000000000000000000000000004',
        expect.any(Object),
      );
    });

    test('no deposits for module for both modules', async () => {
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount - 2);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(curatedFirstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Unvetting for sdvt didnt happen, staking limit the same', async () => {
      const op = await sdvt.getOperator(sdvtOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Unvetting happen in second module', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await guardianService.handleNewBlock();
      await waitForNewerBlock(currentBlock.number);

      const walletAddress = await getWalletAddress();

      // unvetting for second module
      // it is already second unvetting during test
      expect(sendUnvetMessage).toBeCalledTimes(2);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex,
          stakingModuleId: 2,
          operatorIds: packNodeOperatorIds([sdvtOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(2);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        2,
        packNodeOperatorIds([sdvtOperator.index]),
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    });

    test('Staking limit for sdvt after unvetting', async () => {
      const op = await sdvt.getOperator(sdvtOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });

    test('Deposits again work for first module, but not for second', async () => {
      expect(sendDepositMessage).toBeCalledTimes(
        3 * stakingModulesCount - 2 - 1,
      );
    });
  });
});
