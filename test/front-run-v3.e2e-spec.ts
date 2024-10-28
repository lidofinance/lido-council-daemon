// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Helpers

// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  LIDO_WC,
  BAD_WC,
  sk,
  pk,
  NOP_REGISTRY,
  SIMPLE_DVT,
  SECURITY_MODULE,
  SANDBOX,
  CSM,
  SECURITY_MODULE_OWNER,
} from './constants';

// Contract Factories
import { SecurityAbi__factory } from '../src/generated';

// BLS helpers

// App modules and services
import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { SecurityService } from 'contracts/security';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { GuardianMessageService } from 'guardian/guardian-message';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import {
  addGuardians,
  deposit,
  getGuardians,
  getLidoWC,
  getSecurityContract,
  getSecurityOwner,
} from './helpers/dsm';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import { BlsService } from 'bls';
import { getWalletAddress, makeDeposit, signDeposit } from './helpers/deposit';
import { CuratedOnchainV1 } from './helpers/nor.contract';
import {
  waitForNewerBlock,
  waitForNewerOrEqBlock,
  waitForServiceToBeReady,
} from './helpers/kapi';
import {
  // closeClient,
  // ensureClientConnection,
  truncateTables,
} from './helpers/pg';
import { accountImpersonate, testSetupProvider } from './helpers/provider';
import { SecretKey } from '@chainsafe/blst';
import { getStakingModules } from './helpers/sr.contract';
import { packNodeOperatorIds } from 'guardian/unvetting/bytes';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

describe('front-run e2e tests', () => {
  let providerService: ProviderService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let securityService: SecurityService;
  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeysRegistryService: SigningKeysRegistryService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;

  // method mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
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

  describe('Front-run attempt', () => {
    let snapshotId: number;
    let stakingModulesAddresses: string[];
    let curatedModuleAddress: string;
    let stakingModulesCount: number;
    let firstOperator: any;
    let nor: CuratedOnchainV1;
    let frontrunPK: Uint8Array = pk;
    let frontrunSK: SecretKey = sk;
    let lidoDepositSignature: Uint8Array;
    let guardianIndex: number;
    let lidoWC: string;
    let lidoDepositData: {
      signature: Uint8Array;
      pubkey: Uint8Array;
      withdrawalCredentials: Uint8Array;
      amount: number;
    };
    let securityModuleAddress: string;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      const securityModule = await getSecurityContract();
      const securityModuleOwner = await getSecurityOwner();
      await accountImpersonate(securityModuleOwner);
      const oldGuardians = await getGuardians();
      securityModuleAddress = securityModule.address;
      await addGuardians({
        securityModule: securityModuleAddress,
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
      lidoWC = await getLidoWC();
      const { signature, depositData } = await signDeposit(
        frontrunPK,
        frontrunSK,
        lidoWC,
      );
      lidoDepositSignature = signature;
      lidoDepositData = depositData;
    }, 40_000);

    afterAll(async () => {
      // we need to revert after each test because unvetting change only vettedAmount and will not delete key
      await testSetupProvider.send('evm_revert', [snapshotId]);
      // clear db
      // KAPI see that db is empty and update state
      // Open a new DB connection
      // await ensureClientConnection();
      await truncateTables();

      await levelDBService.deleteCache();
      await signKeyLevelDBService.deleteCache();
      await levelDBService.close();
      await signKeyLevelDBService.close();
    }, 40_000);

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

    test('add unused unvetted key', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(frontrunPK),
        toHexString(lidoDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Make deposit with non-lido WC', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // Attempt to front run
      const { depositData: theftDepositData } = await signDeposit(
        frontrunPK,
        frontrunSK,
        BAD_WC,
      );
      await makeDeposit(theftDepositData, providerService);
      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Make deposit with lido WC', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // Attempt to front run
      await makeDeposit(lidoDepositData, providerService);
      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Key is not vetted, module will not be set on soft pause', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
      // 4 - number of modules
      expect(sendDepositMessage).toBeCalledTimes(stakingModulesCount);
    }, 30_000);

    test('Increase staking limit', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Check staking limit for curated operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test(
      'Unvetting',
      async () => {
        const currentBlock = await providerService.provider.getBlock('latest');
        await guardianService.handleNewBlock();
        await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

        const walletAddress = await getWalletAddress();

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
        expect(sendDepositMessage).toBeCalledTimes(2 * stakingModulesCount - 1);
      },
      TESTS_TIMEOUT,
    );

    test('no pause happen', async () => {
      expect(sendPauseMessage).toBeCalledTimes(0);

      const securityContract = SecurityAbi__factory.connect(
        securityModuleAddress,
        providerService.provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(false);
    }, 30_000);

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe.only('Failed 1eth deposit attack to stop deposits', () => {
    let snapshotId: number;
    let stakingModulesAddresses: string[];
    let curatedModuleAddress: string;
    let stakingModulesCount: number;
    let firstOperator: any;
    let nor: CuratedOnchainV1;
    let duplicatePK: Uint8Array = pk;
    let duplicateSK: SecretKey = sk;
    let lidoDepositSignature: Uint8Array;
    let guardianIndex: number;
    let lidoWC: string;
    let lidoDepositData: {
      signature: Uint8Array;
      pubkey: Uint8Array;
      withdrawalCredentials: Uint8Array;
      amount: number;
    };
    let securityModuleAddress: string;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      const securityModule = await getSecurityContract();
      const securityModuleOwner = await getSecurityOwner();
      await accountImpersonate(securityModuleOwner);
      const oldGuardians = await getGuardians();
      securityModuleAddress = securityModule.address;
      await addGuardians({
        securityModule: securityModuleAddress,
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
      lidoWC = await getLidoWC();
      const { signature, depositData } = await signDeposit(
        duplicatePK,
        duplicateSK,
        lidoWC,
      );
      lidoDepositSignature = signature;
      lidoDepositData = depositData;
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
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
        },
      });
    });

    test('add unused unvetted key', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const { signature } = await signDeposit(pk, sk, LIDO_WC);
      await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Make deposit with lido WC', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // Attempt to front run
      const { depositData: goodDepositData } = await signDeposit(
        pk,
        sk,
        LIDO_WC,
        1000000000,
      );
      await makeDeposit(goodDepositData, providerService, 1);
      await waitForNewerBlock(currentBlock.number);
    }, 20000);

    test('Increase staking limit', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test(
      'no unvetting will happen',
      async () => {
        const currentBlock = await providerService.provider.getBlock('latest');
        await guardianService.handleNewBlock();
        await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

        const walletAddress = await getWalletAddress();

        expect(sendUnvetMessage).toBeCalledTimes(0);
        expect(sendDepositMessage).toBeCalledTimes(4);
      },
      TESTS_TIMEOUT,
    );

    test('no pause happen', async () => {
      expect(sendPauseMessage).toBeCalledTimes(0);

      const securityContract = SecurityAbi__factory.connect(
        SECURITY_MODULE,
        providerService.provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(false);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });

  describe('Failed 1eth deposit attack to stop deposits with a wrong signature and wc', () => {
    let snapshotId: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      await accountImpersonate(SECURITY_MODULE_OWNER);
      await setupGuardians();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);

      setupMocks();
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
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
        },
      });
    });

    test('add unused unvetted key', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const { signature } = await signDeposit(pk, sk, LIDO_WC);
      await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Make invalid deposit with non-lido wc', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // Attempt to front run
      const { depositData: goodDepositData } = await signDeposit(
        pk,
        sk,
        LIDO_WC,
        1000000000,
      );
      await makeDeposit(goodDepositData, providerService, 1);

      const { signature: weirdSign } = await signDeposit(pk, sk, BAD_WC, 0);
      const { depositData } = await signDeposit(pk, sk, BAD_WC, 1000000000);
      await makeDeposit(
        { ...depositData, signature: weirdSign },
        providerService,
        1,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Increase staking limit', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    }, 10_00);

    test(
      'no unvetting will happen',
      async () => {
        await guardianService.handleNewBlock();
        await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

        expect(sendUnvetMessage).toBeCalledTimes(0);
        expect(sendDepositMessage).toBeCalledTimes(4);
      },
      TESTS_TIMEOUT,
    );

    test('no pause happen', async () => {
      expect(sendPauseMessage).toBeCalledTimes(0);

      const securityContract = SecurityAbi__factory.connect(
        SECURITY_MODULE,
        providerService.provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(false);
    }, 30_000);

    test('deposits still work', async () => {
      expect(sendPauseMessage).toBeCalledTimes(0);

      const securityContract = SecurityAbi__factory.connect(
        SECURITY_MODULE,
        providerService.provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(false);
    }, 30_000);

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });

  describe('Historical front-run', () => {
    let snapshotId: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      // start only if /modules return 200
      await waitForServiceToBeReady();

      await accountImpersonate(SECURITY_MODULE_OWNER);
      await setupGuardians();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);

      setupMocks();
    }, 40_000);

    afterAll(async () => {
      // we need to revert after each test because unvetting change only vettedAmount and will not delete key
      await testSetupProvider.send('evm_revert', [snapshotId]);
      // Сlear db
      // KAPI see that db is empty and update state
      await truncateTables();

      await levelDBService.deleteCache();
      await signKeyLevelDBService.deleteCache();
      await levelDBService.close();
      await signKeyLevelDBService.close();
    }, 30_000);

    test('add unused unvetted key', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const { signature } = await signDeposit(pk, sk, LIDO_WC);
      await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));

      await waitForNewerBlock(currentBlock.number);
    }, 20000);

    test('Increase staking limit', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20000);

    test('make deposit', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      await deposit(100, 1);
      await waitForNewerBlock(currentBlock.number);
    }, 20000);

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
      expect(Number(op.totalAddedValidators)).toEqual(4);
      expect(Number(op.totalDepositedValidators)).toEqual(4);

      await waitForNewerOrEqBlock(currentBlock.number);
    }, 20_000);

    test('Check key in kapi', async () => {
      const {
        data: { keys },
      } = await keysApiService.getModuleKeys(1, 0);
      expect(keys.length).toBe(4);
      const lastKeys = keys.find(({ index }) => index === 3);
      expect(lastKeys?.used).toBe(true);
    });

    test('Set cache to current block', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const { signature: lidoSign } = await signDeposit(pk, sk);
      const { signature: theftDepositSign } = await signDeposit(pk, sk, BAD_WC);

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
            blockNumber: currentBlock.number - 9,
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
            blockNumber: currentBlock.number - 8,
            logIndex: 1,
            depositCount: 2,
            depositDataRoot: new Uint8Array(),
            index: '',
          },
        ],
        headers: {
          startBlock: currentBlock.number - 10,
          endBlock: currentBlock.number,
        },
      });

      await signingKeysRegistryService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number - 10,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, SIMPLE_DVT, CSM, SANDBOX],
        },
      });
    }, 5_000);

    test('Run council daemon', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));
    }, 80_000);

    test('Pause happen', async () => {
      const securityContract = SecurityAbi__factory.connect(
        SECURITY_MODULE,
        providerService.provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(true);

      expect(sendPauseMessage).toBeCalledTimes(1);
    });
  });
});

// TODO: guardian balance
