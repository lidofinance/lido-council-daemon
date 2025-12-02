// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Helpers

// Constants
import { SLEEP_FOR_RESULT, BAD_WC, sk, pk } from './constants';

// Contract Factories
import { SecurityAbi__factory } from '../src/generated';

// BLS helpers

// App modules and services
import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { GuardianMessageService } from 'guardian/guardian-message';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import {
  addGuardians,
  canDeposit,
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
  waitKAPIUpdateModulesKeys,
} from './helpers/kapi';
import { truncateTables } from './helpers/pg';
import { accountImpersonate, testSetupProvider } from './helpers/provider';
import { SecretKey } from '@chainsafe/blst';
import {
  getStakingModulesInfo,
  prioritizeShareLimit,
} from './helpers/sr.contract';
import { packNodeOperatorIds } from 'guardian/unvetting/bytes';
import {
  setupContainers,
  startContainerIfNotRunning,
} from './helpers/docker-containers/utils';
import { HardhatServer } from './helpers/hardhat-server';
import { cutModulesKeys } from './helpers/reduce-keys';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');
jest.setTimeout(300_000);

describe('Front-run e2e tests', () => {
  let provider: SimpleFallbackJsonRpcBatchProvider;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeysRegistryService: SigningKeysRegistryService;
  let depositIntegrityCheckerService: DepositIntegrityCheckerService;

  // method mocks
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let sendUnvetMessage: jest.SpyInstance;

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

    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);

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
  };

  let stakingModulesAddresses: string[];
  let curatedModuleAddress: string;
  let stakingModulesCount: number;
  let firstOperator: any;
  let nor: CuratedOnchainV1;
  const frontrunPK: Uint8Array = pk;
  const frontrunSK: SecretKey = sk;
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
    securityModuleAddress = securityModule.address;
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
    lidoWC = await getLidoWC();
    const { signature, depositData } = await signDeposit(
      frontrunPK,
      frontrunSK,
      lidoWC,
    );
    lidoDepositSignature = signature;
    lidoDepositData = depositData;
  }, 360_000);

  afterAll(async () => {
    await keysApiContainer.stop();
    await hardhatServer.stop();
    await postgresContainer.stop();
  }, 40_000);

  describe('Front-run attempt', () => {
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
      const currentBlock = await provider.getBlock('latest');

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
      const currentBlock = await provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(frontrunPK),
        toHexString(lidoDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('Make deposit with non-lido WC', async () => {
      const currentBlock = await provider.getBlock('latest');
      // Attempt to front run
      const { depositData: theftDepositData } = await signDeposit(
        frontrunPK,
        frontrunSK,
        BAD_WC,
      );
      await makeDeposit(theftDepositData, provider);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Make deposit with lido WC', async () => {
      const currentBlock = await provider.getBlock('latest');
      // Attempt to front run
      await makeDeposit(lidoDepositData, provider);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Key is not vetted, module will not be set on soft pause', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toHaveBeenCalledTimes(0);
      // 4 - number of modules
      expect(sendDepositMessage).toHaveBeenCalledTimes(stakingModulesCount);
    });

    test('Increase staking limit', async () => {
      const currentBlock = await provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for curated operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('Unvetting', async () => {
      const currentBlock = await provider.getBlock('latest');
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const walletAddress = await getWalletAddress();

      expect(sendUnvetMessage).toHaveBeenCalledTimes(1);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: walletAddress,
          guardianIndex,
          stakingModuleId: 1,
          // TODO: get rid of use function here
          // write value, as function can have error
          operatorIds: packNodeOperatorIds([firstOperator.index]),
          vettedKeysByOperator: '0x00000000000000000000000000000003',
        }),
      );
      expect(sendDepositMessage).toHaveBeenCalledTimes(
        2 * stakingModulesCount - 1,
      );
    }, 50_000);

    test('no pause happen', async () => {
      expect(sendPauseMessage).toHaveBeenCalledTimes(0);

      const securityContract = SecurityAbi__factory.connect(
        securityModuleAddress,
        provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(false);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(3);
    });
  });

  describe('Failed 1eth deposit attack to stop deposits', () => {
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
      const currentBlock = await provider.getBlock('latest');

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
      const currentBlock = await provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(frontrunPK),
        toHexString(lidoDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('Make deposit with lido WC', async () => {
      const currentBlock = await provider.getBlock('latest');
      // Attempt to front run
      const { depositData: goodDepositData } = await signDeposit(
        frontrunPK,
        frontrunSK,
        lidoWC,
        1000000000,
      );
      await makeDeposit(goodDepositData, provider, 1);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Increase staking limit', async () => {
      const currentBlock = await provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('no unvetting will happen', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toHaveBeenCalledTimes(0);
      // deposits work for every module
      expect(sendDepositMessage).toHaveBeenCalledTimes(stakingModulesCount);
    });

    test('no pause happen', async () => {
      expect(sendPauseMessage).toHaveBeenCalledTimes(0);

      const securityContract = SecurityAbi__factory.connect(
        securityModuleAddress,
        provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(false);
    });

    test('Check staking limit for sdvt operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });

  describe('Failed 1eth deposit attack to stop deposits with a wrong signature and wc', () => {
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
      const currentBlock = await provider.getBlock('latest');

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
      const currentBlock = await provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(frontrunPK),
        toHexString(lidoDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    test('Make invalid deposit with non-lido wc', async () => {
      const currentBlock = await provider.getBlock('latest');

      const { signature: weirdSign } = await signDeposit(
        frontrunPK,
        frontrunSK,
        BAD_WC,
        0,
      );
      const { depositData } = await signDeposit(pk, sk, BAD_WC, 1000000000);
      await makeDeposit({ ...depositData, signature: weirdSign }, provider, 1);

      await waitForNewerBlock(currentBlock.number);
    });

    test('Increase staking limit', async () => {
      const currentBlock = await provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('no unvetting will happen', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toHaveBeenCalledTimes(0);
    });

    test('no pause happen', async () => {
      expect(sendPauseMessage).toHaveBeenCalledTimes(0);

      const securityContract = SecurityAbi__factory.connect(
        securityModuleAddress,
        provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(false);
    });

    test('deposits still work', async () => {
      expect(sendDepositMessage).toHaveBeenCalledTimes(stakingModulesCount);
    });

    test('Check staking limit for sdvt operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });
  // Error: VM Exception while processing transaction: reverted with reason string 'APP_AUTH_FAILED'"
  // reason - need add dual governance support
  // TODO: implement dual governance support
  describe('Historical front-run', () => {
    let snapshotId: number;
    let canRunTests = true;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      await waitKAPIUpdateModulesKeys();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);
      setupMocks();
      canRunTests = await canDeposit();
      console.log('canRunTests', canRunTests);
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

    const runIf = canRunTests ? test : test.skip;

    runIf('add unused unvetted key', async () => {
      const currentBlock = await provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(frontrunPK),
        toHexString(lidoDepositSignature),
        firstOperator.rewardAddress,
      );

      await waitForNewerBlock(currentBlock.number);
    });

    runIf('Increase staking limit', async () => {
      const currentBlock = await provider.getBlock('latest');

      // keys total amount was 3, added key with wrong sign, now it is 4 keys
      // increase limit to 4
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    runIf(
      'decrease share limit for all modules except curated',
      async () => {
        // curated module id - 1
        await prioritizeShareLimit(1);
      },
      60_000,
    );

    runIf(
      'deposit lido key',
      async () => {
        const currentBlock = await provider.getBlock('latest');
        await deposit(1);
        await waitForNewerBlock(currentBlock.number);
      },
      60_000,
    );

    runIf(
      'Check staking limit for operator that key was deposited',
      async () => {
        const currentBlock = await provider.getBlock('latest');
        const op = await nor.getOperator(firstOperator.index, false);
        expect(Number(op.totalVettedValidators)).toEqual(4);
        expect(Number(op.totalAddedValidators)).toEqual(4);
        expect(Number(op.totalDepositedValidators)).toEqual(4);

        await waitForNewerOrEqBlock(currentBlock.number);
      },
    );

    runIf('Check kapi see new used key', async () => {
      const {
        data: { keys },
      } = await keysApiService.getModuleKeys(1, firstOperator.index);
      expect(keys.length).toBe(4);
      const lastKeys = keys.find(({ index }) => index === 3);
      expect(lastKeys?.used).toBe(true);
    });

    runIf('Set cache to current block', async () => {
      const currentBlock = await provider.getBlock('latest');
      const { signature: lidoSign } = await signDeposit(
        frontrunPK,
        frontrunSK,
        lidoWC,
      );
      const { signature: theftDepositSign } = await signDeposit(
        frontrunPK,
        frontrunSK,
        BAD_WC,
      );

      await levelDBService.setCachedEvents({
        data: [
          {
            valid: true,
            pubkey: toHexString(frontrunPK),
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
            pubkey: toHexString(frontrunPK),
            amount: '32000000000',
            wc: lidoWC,
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
          stakingModulesAddresses,
        },
      });
    });

    runIf('Run council daemon', async () => {
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));
    });

    runIf('Pause happen', async () => {
      const securityContract = SecurityAbi__factory.connect(
        securityModuleAddress,
        provider,
      );

      const isOnPause = await securityContract.isDepositsPaused();
      expect(isOnPause).toBe(true);
      expect(sendPauseMessage).toHaveBeenCalledTimes(1);
    });

    runIf('Deposits does not work for whole list of modules', () => {
      expect(sendDepositMessage).toHaveBeenCalledTimes(0);
    });
  });
});
