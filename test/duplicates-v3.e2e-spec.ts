// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  STAKING_ROUTER,
  GANACHE_PORT,
  NOP_REGISTRY,
  SIMPLE_DVT,
  UNLOCKED_ACCOUNTS,
  SECURITY_MODULE_OWNER,
  CSM,
  SANDBOX,
  pk,
  sk,
  LIDO_WC,
} from './constants';

// Contract Factories
import { StakingRouterAbi__factory } from '../src/generated';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { getWalletAddress, signDeposit } from './helpers/deposit';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { ProviderService } from 'provider';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SecurityService } from 'contracts/security';
import { Server } from 'ganache';
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
import {
  accountImpersonate,
  setBalance,
  testSetupProvider,
} from './helpers/provider';
import { waitForNewerBlock, waitForServiceToBeReady } from './helpers/kapi';
import { truncateTables } from './helpers/pg';
import {
  ADD_KEY_ACCOUNT_NODE_OP_ONE,
  ADD_KEY_ACCOUNT_NODE_OP_ZERO,
  ADD_KEY_ACCOUNT_NODE_OP_ZERO_SDVT,
  CuratedOnchainV1,
} from './helpers/nor.contract';
import { toHexString } from 'contracts/deposits-registry/crypto';
import { EVM_SCRIPT_EXECUTOR } from './helpers/easy-tack';
import { getStakingModules } from './helpers/sr.contract';
import { Contract } from '@ethersproject/contracts';
import { SecretKey } from '@chainsafe/blst';
import { packNodeOperatorIds } from 'guardian/unvetting/bytes';

describe('Deposits in case of duplicates', () => {
  let server: Server<'ethereum'>;
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
  let sendPauseMessage: jest.SpyInstance;
  let unvetSigningKeys: jest.SpyInstance;

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

  describe('Duplicated key across operators of one modules', () => {
    let snapshotId: number;
    let stakingModulesAddresses: string[];
    let curatedModuleAddress: string;
    let stakingModulesCount: number;
    let firstOperator: any;
    let secondOperator: any;
    let nor: CuratedOnchainV1;
    let duplicatePK: Uint8Array = pk;
    let duplicateSK: SecretKey = sk;
    let duplicateDepositSignature: Uint8Array;
    let guardianIndex: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      const securityModule = await getSecurityContract();
      const securityModuleOwner = await getSecurityOwner();
      await accountImpersonate(securityModuleOwner);
      const oldGuardians = await getGuardians();
      await addGuardians({
        securityModule: securityModule.address,
        securityModuleOwner,
      });
      const newGuardians = await getGuardians();
      // TODO: read from contract
      guardianIndex = newGuardians.length - 1;
      expect(newGuardians.length).toEqual(oldGuardians.length + 1);

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);

      setupMocks();

      const srModules = await getStakingModules();
      stakingModulesAddresses = srModules.map(
        (stakingModule) => stakingModule.stakingModuleAddress,
      );

      curatedModuleAddress = srModules.find(
        (srModule) => srModule.id === 1,
      ).stakingModuleAddress;
      stakingModulesCount = stakingModulesAddresses.length;

      console.log('Stats:', {
        curatedModuleAddress,
        stakingModulesAddresses,
      });

      // get two different active operators
      nor = new CuratedOnchainV1(curatedModuleAddress);
      const activeOperators = await nor.getActiveOperators();
      firstOperator = activeOperators[0];
      secondOperator = activeOperators[1];

      // create duplicate
      const lidoWC = await getLidoWC();
      const { signature } = await signDeposit(duplicatePK, duplicateSK, lidoWC);
      duplicateDepositSignature = signature;
    }, 40_000);

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
    }, 30_000);

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
        firstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('add duplicate key to first operator of the first module', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await nor.addSigningKey(
        secondOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        secondOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 15_000);

    test('no unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    }, 20_000);

    test('deposits work', async () => {
      // TODO: maybe staking module count
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    });

    test('increase staking limit for the first operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      // TODO: maybe move to constant staking limit
      // as modules have the same amount of keys
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20_000);

    test('no unvetting after staking limit increase for the first operator', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(unvetSigningKeys).toBeCalledTimes(0);
    }, 30_000);

    test('deposits work', async () => {
      // second iteration of deposits
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount * 2);
    });

    test('increase staking limit for the second operator', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(secondOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20_000);

    test('Check staking limit for nor operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    }, 15_000);

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await nor.getOperator(secondOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    }, 15_000);

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
          operatorIds: packNodeOperatorIds([secondOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([secondOperator.index]),
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    }, 40_000);

    test('no deposits for module', async () => {
      // 8 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(
        stakingModulesCount * 2 + stakingModulesCount - 1,
      );
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const op = await nor.getOperator(secondOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Duplicate created for already deposited key', () => {
    let snapshotId: number;
    let stakingModulesAddresses: string[];
    let curatedModuleAddress: string;
    let stakingModulesCount: number;
    let firstOperator: any;
    let nor: CuratedOnchainV1;
    let guardianIndex: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      const securityModule = await getSecurityContract();
      const securityModuleOwner = await getSecurityOwner();
      await accountImpersonate(securityModuleOwner);
      const oldGuardians = await getGuardians();
      await addGuardians({
        securityModule: securityModule.address,
        securityModuleOwner,
      });
      const newGuardians = await getGuardians();
      // TODO: read from contract
      guardianIndex = newGuardians.length - 1;
      expect(newGuardians.length).toEqual(oldGuardians.length + 1);

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);

      setupMocks();

      const srModules = await getStakingModules();
      stakingModulesAddresses = srModules.map(
        (stakingModule) => stakingModule.stakingModuleAddress,
      );

      curatedModuleAddress = srModules.find(
        (srModule) => srModule.id === 1,
      ).stakingModuleAddress;
      stakingModulesCount = stakingModulesAddresses.length;

      // get two different active operators
      nor = new CuratedOnchainV1(curatedModuleAddress);
      const activeOperators = await nor.getActiveOperators();
      firstOperator = activeOperators[0];
    }, 40_000);

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
    }, 30_000);

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
      // TODO: create new key instead
      // it is important to fix this todo to run on new chain tests
      const {
        data: { keys },
      } = await keysApiService.getModuleKeys(1, 0);

      const publicKey = keys[0].key;
      const depositSignature = keys[0].depositSignature;

      await nor.addSigningKey(
        firstOperator.index,
        1,
        publicKey,
        depositSignature,
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

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
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
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
          stakingModuleId: 1, // TODO: move to constant or read from contract
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

    test('no deposits for module', async () => {
      // 8 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount - 1);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Duplicated key one operator of one modules', () => {
    let snapshotId: number;
    let stakingModulesAddresses: string[];
    let curatedModuleAddress: string;
    let stakingModulesCount: number;
    let firstOperator: any;
    let nor: CuratedOnchainV1;
    let duplicatePK: Uint8Array = pk;
    let duplicateSK: SecretKey = sk;
    let duplicateDepositSignature: Uint8Array;
    let guardianIndex: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      const securityModule = await getSecurityContract();
      const securityModuleOwner = await getSecurityOwner();
      await accountImpersonate(securityModuleOwner);
      const oldGuardians = await getGuardians();
      await addGuardians({
        securityModule: securityModule.address,
        securityModuleOwner,
      });
      const newGuardians = await getGuardians();
      // TODO: read from contract
      guardianIndex = newGuardians.length - 1;
      expect(newGuardians.length).toEqual(oldGuardians.length + 1);

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);

      setupMocks();

      const srModules = await getStakingModules();
      stakingModulesAddresses = srModules.map(
        (stakingModule) => stakingModule.stakingModuleAddress,
      );

      curatedModuleAddress = srModules.find(
        (srModule) => srModule.id === 1,
      ).stakingModuleAddress;
      stakingModulesCount = stakingModulesAddresses.length;

      console.log('Stats:', {
        curatedModuleAddress,
        stakingModulesAddresses,
      });

      // get two different active operators
      nor = new CuratedOnchainV1(curatedModuleAddress);
      const activeOperators = await nor.getActiveOperators();
      firstOperator = activeOperators[0];
      // create duplicate
      const lidoWC = await getLidoWC();
      const { signature } = await signDeposit(duplicatePK, duplicateSK, lidoWC);
      duplicateDepositSignature = signature;
    }, 40_000);

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
    }, 30_000);

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
        firstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        firstOperator.rewardAddress,
      );

      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

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
      await nor.setStakingLimit(firstOperator.index, 5);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
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
          operatorIds: packNodeOperatorIds([firstOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000004',
        }),
      );
      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([firstOperator.index]),
        '0x00000000000000000000000000000004',
        expect.any(Object),
      );
    }, 30_000);

    test('No deposits for module', async () => {
      // 4 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount - 1);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });

  describe('Duplicated key across operators of two modules', () => {
    let snapshotId: number;
    let stakingModulesAddresses: string[];
    let curatedModuleAddress: string;
    let sdvtModuleAddress: string;
    let stakingModulesCount: number;
    let firstOperator: any;
    let secondOperator: any;
    let nor: CuratedOnchainV1;
    let sdvt: CuratedOnchainV1;
    let duplicatePK: Uint8Array = pk;
    let duplicateSK: SecretKey = sk;
    let duplicateDepositSignature: Uint8Array;
    let guardianIndex: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      const securityModule = await getSecurityContract();
      const securityModuleOwner = await getSecurityOwner();
      await accountImpersonate(securityModuleOwner);
      const oldGuardians = await getGuardians();
      await addGuardians({
        securityModule: securityModule.address,
        securityModuleOwner,
      });
      const newGuardians = await getGuardians();
      // TODO: read from contract
      guardianIndex = newGuardians.length - 1;
      expect(newGuardians.length).toEqual(oldGuardians.length + 1);

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);

      setupMocks();

      const srModules = await getStakingModules();
      stakingModulesAddresses = srModules.map(
        (stakingModule) => stakingModule.stakingModuleAddress,
      );

      curatedModuleAddress = srModules.find(
        (srModule) => srModule.id === 1,
      ).stakingModuleAddress;
      stakingModulesCount = stakingModulesAddresses.length;

      sdvtModuleAddress = srModules.find(
        (srModule) => srModule.id === 2,
      ).stakingModuleAddress;

      // get two different active operators
      nor = new CuratedOnchainV1(curatedModuleAddress);
      sdvt = new CuratedOnchainV1(sdvtModuleAddress);
      const activeOperators = await nor.getActiveOperators();
      const sdvtActiveOperators = await sdvt.getActiveOperators();
      firstOperator = activeOperators[0];
      secondOperator = sdvtActiveOperators[0];

      // create duplicate
      const lidoWC = await getLidoWC();
      const { signature } = await signDeposit(duplicatePK, duplicateSK, lidoWC);
      duplicateDepositSignature = signature;
    }, 40_000);

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
    }, 30_000);

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
        firstOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('add duplicate key to the first operator of the SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      await sdvt.addSigningKey(
        secondOperator.index,
        1,
        toHexString(duplicatePK),
        toHexString(duplicateDepositSignature),
        secondOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 15_000);

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
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20_000);

    test('no unvetting after staking limit increase for 0 operator of NOR contract', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(unvetSigningKeys).toBeCalledTimes(0);
    }, 20_000);

    test('deposits work', async () => {
      // 4 prev + 4 new
      expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount);
    });

    test('increase staking limit for the first operator of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await sdvt.setStakingLimit(secondOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20_000);

    test('Check staking limit for nor operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await sdvt.getOperator(secondOperator.index, false);
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
          operatorIds: packNodeOperatorIds([secondOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        2,
        packNodeOperatorIds([secondOperator.index]),
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    }, 30_000);

    test('no deposits for module', async () => {
      // 8 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(3 * stakingModulesCount - 1);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const op = await sdvt.getOperator(secondOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  // describe('Unvetting in two modules', () => {
  //   let snapshotId: number;

  //   beforeAll(async () => {
  //     snapshotId = await testSetupProvider.send('evm_snapshot', []);
  //     // start only if /modules return 200
  //     await waitForServiceToBeReady();

  //     await accountImpersonate(SECURITY_MODULE_OWNER);
  //     await setupGuardians();

  //     const moduleRef = await setupTestingModule();
  //     await setupTestingServices(moduleRef);

  //     setupMocks();
  //   }, 40_000);

  //   afterAll(async () => {
  //     // we need to revert after each test because unvetting change only vettedAmount and will not delete key
  //     await testSetupProvider.send('evm_revert', [snapshotId]);
  //     // clear db
  //     // KAPI see that db is empty and update state
  //     await truncateTables();

  //     await levelDBService.deleteCache();
  //     await signKeyLevelDBService.deleteCache();
  //     await levelDBService.close();
  //     await signKeyLevelDBService.close();
  //   }, 30_000);

  //   test('Set cache to current block', async () => {
  //     const currentBlock = await providerService.provider.getBlock('latest');

  //     await levelDBService.setCachedEvents({
  //       data: [],
  //       headers: {
  //         startBlock: currentBlock.number,
  //         endBlock: currentBlock.number,
  //       },
  //     });

  //     await signingKeysRegistryService.setCachedEvents({
  //       data: [],
  //       headers: {
  //         startBlock: currentBlock.number,
  //         endBlock: currentBlock.number,
  //         stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
  //       },
  //     });
  //   });

  //   test('add unused unvetted key to op = 0 of nor contract', async () => {
  //     const currentBlock = await providerService.provider.getBlock('latest');
  //     const nor = new CuratedOnchainV1(NOP_REGISTRY);
  //     const { signature } = await signDeposit(pk, sk, LIDO_WC);

  //     // add two keys
  //     // key with smaller index will be considered across one operator as original
  //     await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));
  //     await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));

  //     await waitForNewerBlock(currentBlock.number);
  //   }, 30_000);

  //   test('add duplicate key to op = 0 of SDVT contract', async () => {
  //     const currentBlock = await providerService.provider.getBlock('latest');
  //     const nor = new CuratedOnchainV1(SIMPLE_DVT);
  //     const { signature } = await signDeposit(pk, sk, LIDO_WC);

  //     await nor.addSigningKey(
  //       0,
  //       1,
  //       toHexString(pk),
  //       toHexString(signature),
  //       ADD_KEY_ACCOUNT_NODE_OP_ZERO_SDVT,
  //     );

  //     await waitForNewerBlock(currentBlock.number);
  //   }, 15_000);

  //   test('no unvetting', async () => {
  //     await guardianService.handleNewBlock();
  //     await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

  //     expect(sendUnvetMessage).toBeCalledTimes(0);
  //   });

  //   test('deposits work', async () => {
  //     expect(sendDepositMessage).toBeCalledTimes(4);
  //   });

  //   test('increase staking limit for op = 0', async () => {
  //     const currentBlock = await providerService.provider.getBlock('latest');

  //     // keys total amount was 3, added key with wrong sign, now it is 4 keys
  //     // increase limit to 4
  //     const nor = new CuratedOnchainV1(NOP_REGISTRY);
  //     await nor.setStakingLimit(0, 5);
  //     await waitForNewerBlock(currentBlock.number);
  //   }, 20_000);

  //   test('increase staking limit for op = 0 of SDVT contract', async () => {
  //     const currentBlock = await providerService.provider.getBlock('latest');
  //     // keys total amount was 3, added key with wrong sign, now it is 4 keys
  //     // increase limit to 4
  //     const nor = new CuratedOnchainV1(SIMPLE_DVT);
  //     await nor.setStakingLimit(0, 4);
  //     await waitForNewerBlock(currentBlock.number);
  //   }, 20_000);

  //   test('Check staking limit for nor operator before unvetting', async () => {
  //     const nor = new CuratedOnchainV1(NOP_REGISTRY);
  //     const op = await nor.getOperator(0, false);
  //     expect(Number(op.totalVettedValidators)).toEqual(5);
  //   });

  //   test('Check staking limit for sdvt operator before unvetting', async () => {
  //     const nor = new CuratedOnchainV1(SIMPLE_DVT);
  //     const op = await nor.getOperator(0, false);
  //     expect(Number(op.totalVettedValidators)).toEqual(4);
  //   });

  //   test('unvetting happen in first module', async () => {
  //     const currentBlock = await providerService.provider.getBlock('latest');
  //     await guardianService.handleNewBlock();
  //     await waitForNewerBlock(currentBlock.number);

  //     const walletAddress = await getWalletAddress();

  //     // unvetting for second module
  //     expect(sendUnvetMessage).toBeCalledTimes(1);
  //     expect(sendUnvetMessage).toHaveBeenCalledWith(
  //       expect.objectContaining({
  //         blockNumber: currentBlock.number,
  //         guardianAddress: walletAddress,
  //         guardianIndex: 7,
  //         stakingModuleId: 1,
  //         operatorIds: '0x0000000000000000',
  //         vettedKeysByOperator: '0x00000000000000000000000000000004',
  //       }),
  //     );

  //     expect(unvetSigningKeys).toBeCalledTimes(1);
  //     expect(unvetSigningKeys).toHaveBeenCalledWith(
  //       expect.anything(),
  //       currentBlock.number,
  //       expect.anything(),
  //       1,
  //       '0x0000000000000000',
  //       '0x00000000000000000000000000000004',
  //       expect.any(Object),
  //     );
  //   }, 30_000);

  //   test('no deposits for module for both modules', async () => {
  //     //  4 prev + 2  (csm and sandbox)
  //     expect(sendDepositMessage).toBeCalledTimes(6);
  //   });

  //   test('Check staking limit for nor operator after unvetting', async () => {
  //     const nor = new CuratedOnchainV1(NOP_REGISTRY);
  //     const op = await nor.getOperator(0, false);
  //     expect(Number(op.totalVettedValidators)).toEqual(4);
  //   });

  //   test('Unveting for sdvt didnt happen, staking limit the same', async () => {
  //     const nor = new CuratedOnchainV1(SIMPLE_DVT);
  //     const op = await nor.getOperator(0, false);
  //     expect(Number(op.totalVettedValidators)).toEqual(4);
  //   });

  //   test('Unvetting happen in second module', async () => {
  //     const currentBlock = await providerService.provider.getBlock('latest');
  //     await guardianService.handleNewBlock();
  //     await waitForNewerBlock(currentBlock.number);

  //     const walletAddress = await getWalletAddress();

  //     // unvetting for second module
  //     // it is already second unvetting during test
  //     expect(sendUnvetMessage).toBeCalledTimes(2);
  //     expect(sendUnvetMessage).toHaveBeenCalledWith(
  //       expect.objectContaining({
  //         blockNumber: currentBlock.number,
  //         guardianAddress: walletAddress,
  //         guardianIndex: 7,
  //         stakingModuleId: 2,
  //         operatorIds: '0x0000000000000000',
  //         vettedKeysByOperator: '0x00000000000000000000000000000003',
  //       }),
  //     );

  //     expect(unvetSigningKeys).toBeCalledTimes(2);
  //     expect(unvetSigningKeys).toHaveBeenCalledWith(
  //       expect.anything(),
  //       currentBlock.number,
  //       expect.anything(),
  //       2,
  //       '0x0000000000000000',
  //       '0x00000000000000000000000000000003',
  //       expect.any(Object),
  //     );
  //   }, 30_000);

  //   test('Staking limit for sdvt after unvetting', async () => {
  //     const nor = new CuratedOnchainV1(SIMPLE_DVT);
  //     const op = await nor.getOperator(0, false);
  //     expect(Number(op.totalVettedValidators)).toEqual(3);
  //   });

  //   test('Deposits again work for first module, but not for second', async () => {
  //     // 6 prev + 3 new (curated, csm and sandbox)
  //     expect(sendDepositMessage).toBeCalledTimes(9);
  //   });
  // });

  // TODO: add duplicated key at the same block
});
