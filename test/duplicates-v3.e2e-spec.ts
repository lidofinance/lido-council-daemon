// Constants
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  STAKING_ROUTER,
  CHAIN_ID,
  FORK_BLOCK,
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

import {
  setupTestingModule,
  closeServer,
  initLevelDB,
} from './helpers/test-setup';
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
import { makeServer } from './server';
import { addGuardians } from './helpers/dsm';
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

    test('add unused unvetted key to op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const { signature } = signDeposit(pk, sk, LIDO_WC);

      await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('add duplicate key to op = 1', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const { signature } = signDeposit(pk, sk, LIDO_WC);

      await nor.addSigningKey(
        1,
        1,
        toHexString(pk),
        toHexString(signature),
        ADD_KEY_ACCOUNT_NODE_OP_ONE,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 15_000);

    test('no unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(4);
    });

    test('increase staking limit for op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 10_000);

    test('no unvetting after staking limit increase for 0 operator', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(unvetSigningKeys).toBeCalledTimes(0);
    }, 10_000);

    test('deposits work', async () => {
      // 4 prev + 4 new
      expect(sendDepositMessage).toBeCalledTimes(8);
    });

    test('increase staking limit for op = 1', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(1, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20_000);

    test('Check staking limit for nor operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(1, false);
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
          guardianIndex: 7,
          stakingModuleId: 1,
          operatorIds: '0x0000000000000001',
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        '0x0000000000000001',
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    }, 30_000);

    test('no deposits for module', async () => {
      // 8 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(11);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(1, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Duplicate created for an already deposited key', () => {
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

    test('Add unused unvetted key to op = 0 to nor', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);

      // sdvt key = 2 op = 1
      const key =
        '0x81194942c255855346bd0eccbc3b74c25476e30205f824bb2f20114d477ee60001cc4a1c40662dbc0c6c6070a32e1a75';
      const depositSignature =
        '0xaa2e3895af18e7157194d511b9b1981e25fd3561c59c31f66168ee4e92faba4f59d6480a7998ae269bd2640ffbdaf6a8073a47a318138f7397038add82f144f1a56e3ebc0942d0ad3aa3018ee0261cb995f31e6f351b82661d7640f41b8641d2';

      await nor.addSigningKey(0, 1, key, depositSignature);

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('No unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('Deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(4);
    });

    test('Increase staking limit for op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator', async () => {
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const op = await nor.getOperator(1, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });

    test('Unvetting happen for sdvt module', async () => {
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
          guardianIndex: 7,
          stakingModuleId: 1, // TODO: move to constant or read from contract
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
    });

    test('no deposits for module', async () => {
      // 8 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(7);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Duplicated key one operator of one modules', () => {
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

    test('Add unused unvetted duplicated key to op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const publicKey =
        '0xa92daac72ad30458120e2a186400a673a4663768f118806c986ee045667c5599a608da5ea44354df124e6ac8d4ea9570';
      const depositSignature =
        '0x93f492eed0fd6e86e7b50092027a06e186a5edf88250afb82c8c8ebf1febcf28e3a50669a302a4d2d451fab3d0d7d21b174ebf0061c685c2322b06dc6e714aa2a228218884e1fbe033287173c3162796acb4a526eaad031f19bd9dccb7f97a4d';

      await nor.addSigningKey(0, 1, publicKey, depositSignature);

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('No unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('Deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(4);
    });

    test('Increase staking limit for op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
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
    }, 30_000);

    test('No deposits for module', async () => {
      // 4 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(7);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Duplicated key across operators of two modules', () => {
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

    test('add unused unvetted key to op = 0 of nor contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const { signature } = signDeposit(pk, sk, LIDO_WC);

      await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('add duplicate key to op = 0 of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const { signature } = signDeposit(pk, sk, LIDO_WC);

      await nor.addSigningKey(
        0,
        1,
        toHexString(pk),
        toHexString(signature),
        ADD_KEY_ACCOUNT_NODE_OP_ZERO_SDVT,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 15_000);

    test('no unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(4);
    });

    test('increase staking limit for op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 10_000);

    test('no unvetting after staking limit increase for 0 operator of NOR contract', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
      expect(unvetSigningKeys).toBeCalledTimes(0);
    }, 10_000);

    test('deposits work', async () => {
      // 4 prev + 4 new
      expect(sendDepositMessage).toBeCalledTimes(8);
    });

    test('increase staking limit for op = 0 of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20_000);

    test('Check staking limit for nor operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const op = await nor.getOperator(0, false);
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
          guardianIndex: 7,
          stakingModuleId: 2,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        2,
        '0x0000000000000000',
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    }, 30_000);

    test('no deposits for module', async () => {
      // 8 prev + 3 new
      expect(sendDepositMessage).toBeCalledTimes(11);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Unvetting in two modules', () => {
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

    test('add unused unvetted key to op = 0 of nor contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const { signature } = signDeposit(pk, sk, LIDO_WC);

      // add two keys
      // key with smaller index will be considered across one operator as original
      await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));
      await nor.addSigningKey(0, 1, toHexString(pk), toHexString(signature));

      await waitForNewerBlock(currentBlock.number);
    }, 30_000);

    test('add duplicate key to op = 0 of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const { signature } = signDeposit(pk, sk, LIDO_WC);

      await nor.addSigningKey(
        0,
        1,
        toHexString(pk),
        toHexString(signature),
        ADD_KEY_ACCOUNT_NODE_OP_ZERO_SDVT,
      );

      await waitForNewerBlock(currentBlock.number);
    }, 15_000);

    test('no unvetting', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toBeCalledTimes(0);
    });

    test('deposits work', async () => {
      expect(sendDepositMessage).toBeCalledTimes(4);
    });

    test('increase staking limit for op = 0', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      await nor.setStakingLimit(0, 5);
      await waitForNewerBlock(currentBlock.number);
    }, 10_000);

    test('increase staking limit for op = 0 of SDVT contract', async () => {
      const currentBlock = await providerService.provider.getBlock('latest');
      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      await nor.setStakingLimit(0, 4);
      await waitForNewerBlock(currentBlock.number);
    }, 20_000);

    test('Check staking limit for nor operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(5);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const op = await nor.getOperator(0, false);
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
          guardianIndex: 7,
          stakingModuleId: 1,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000004',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        '0x0000000000000000',
        '0x00000000000000000000000000000004',
        expect.any(Object),
      );
    }, 30_000);

    test('no deposits for module for both modules', async () => {
      //  4 prev + 2  (csm and sandbox)
      expect(sendDepositMessage).toBeCalledTimes(6);
    });

    test('Check staking limit for nor operator after unvetting', async () => {
      const nor = new CuratedOnchainV1(NOP_REGISTRY);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Unveting for sdvt didnt happen, staking limit the same', async () => {
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const op = await nor.getOperator(0, false);
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
          guardianIndex: 7,
          stakingModuleId: 2,
          operatorIds: '0x0000000000000000',
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );

      expect(unvetSigningKeys).toBeCalledTimes(2);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        2,
        '0x0000000000000000',
        '0x00000000000000000000000000000003',
        expect.any(Object),
      );
    }, 30_000);

    test('Staking limit for sdvt after unvetting', async () => {
      const nor = new CuratedOnchainV1(SIMPLE_DVT);
      const op = await nor.getOperator(0, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });

    test('Deposits again work for first module, but not for second', async () => {
      // 6 prev + 3 new (curated, csm and sandbox)
      expect(sendDepositMessage).toBeCalledTimes(9);
    });
  });

  // TODO: add duplicated key at the same block
});
