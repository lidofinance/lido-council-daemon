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
  fillLidoBuffer,
  getGuardians,
  getLidoWC,
  getModuleWC,
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

  const getNewDepositMessages = (fromCallIndex: number) => {
    return sendDepositMessage.mock.calls
      .slice(fromCallIndex)
      .map(([message]) => message as { stakingModuleId: number });
  };

  const expectNoDepositsForModule = (moduleId: number, fromCallIndex = 0) => {
    const newDepositMessages = getNewDepositMessages(fromCallIndex);
    expect(
      newDepositMessages.some(
        (message) => message.stakingModuleId === moduleId,
      ),
    ).toBe(false);
  };

  const expectDepositsForModule = (moduleId: number, fromCallIndex = 0) => {
    const newDepositMessages = getNewDepositMessages(fromCallIndex);
    expect(
      newDepositMessages.some(
        (message) => message.stakingModuleId === moduleId,
      ),
    ).toBe(true);
  };

  let stakingModulesAddresses: string[];
  let curatedModuleAddress: string;
  let firstOperator: any;
  let nor: CuratedOnchainV1;
  const frontrunPK: Uint8Array = pk;
  const frontrunSK: SecretKey = sk;
  const validSK: SecretKey = SecretKey.fromKeygen(new Uint8Array(32).fill(7));
  const validPK: Uint8Array = validSK.toPublicKey().toBytes();
  let validDepositSignature: Uint8Array;
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
    await cutModulesKeys(undefined, {
      opCount: 3,
      keysCount: 3,
      depositedCount: 3,
    });

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

    // get two different active operators
    nor = new CuratedOnchainV1(curatedModuleAddress);
    const activeOperators = await nor.getActiveOperators();
    firstOperator = activeOperators[0];
    lidoWC = await getLidoWC();
    const { signature, depositData } = await signDeposit(
      frontrunPK,
      frontrunSK,
      lidoWC,
    );
    lidoDepositSignature = signature;
    lidoDepositData = depositData;

    const { signature: validSig } = await signDeposit(validPK, validSK, lidoWC);
    validDepositSignature = validSig;
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

      // top up Lido buffer so module 1 has allocation for deposits
      await fillLidoBuffer(2);
    }, 50_000);

    afterAll(async () => {
      jest.clearAllMocks();
      await testSetupProvider.send('evm_revert', [snapshotId]);
      await truncateTables();

      await levelDBService?.deleteCache();
      await signKeyLevelDBService?.deleteCache();
      await levelDBService?.close();
      await signKeyLevelDBService?.close();
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

    test('Add valid key and raise staking limit to vet it', async () => {
      const currentBlock = await provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(validPK),
        toHexString(validDepositSignature),
        firstOperator.rewardAddress,
      );
      // after cut vetted=3, deposited=3. Bump vetted to 4 to vet the new valid key.
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Add front-run key (stays unvetted)', async () => {
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

    test('Front-run key is not vetted, module keeps depositing the valid key', async () => {
      const depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toHaveBeenCalledTimes(0);
      expectDepositsForModule(1, depositCallsBeforeCycle);
    });

    test('Increase staking limit to vet the front-run key', async () => {
      const currentBlock = await provider.getBlock('latest');
      // vetted=4, deposited=3, +valid key vetted, +frontrun key unvetted. Bump to 5.
      await nor.setStakingLimit(firstOperator.index, 5);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for curated operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(5);
    });

    test('Unvetting', async () => {
      const currentBlock = await provider.getBlock('latest');
      const depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;
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
          operatorIds: packNodeOperatorIds([firstOperator.index]),
          // unvet back to 4: keep valid key, drop front-run key
          vettedKeysByOperator: '0x00000000000000000000000000000004',
        }),
      );
      expectNoDepositsForModule(1, depositCallsBeforeCycle);
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

    test('Check staking limit for curated operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
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

      // top up Lido buffer so module 1 has allocation for deposits
      await fillLidoBuffer(2);
    }, 50_000);

    afterAll(async () => {
      jest.clearAllMocks();
      await testSetupProvider.send('evm_revert', [snapshotId]);
      await truncateTables();

      await levelDBService?.deleteCache();
      await signKeyLevelDBService?.deleteCache();
      await levelDBService?.close();
      await signKeyLevelDBService?.close();
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

    test('Make 1 ETH deposit with lido WC (failed attack)', async () => {
      const currentBlock = await provider.getBlock('latest');
      // 1 ETH deposit with legit lidoWC — not a front-run, just griefing attempt
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
      // raise vetted 3 → 4 to vet the newly added key
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for curated operator', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    test('no unvetting will happen', async () => {
      const depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendUnvetMessage).toHaveBeenCalledTimes(0);
      expectDepositsForModule(1, depositCallsBeforeCycle);
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

    test('Staking limit stays at 4 (no unvetting)', async () => {
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

      // top up Lido buffer so module 1 has allocation for deposits
      await fillLidoBuffer(2);
    }, 50_000);

    afterAll(async () => {
      jest.clearAllMocks();
      await testSetupProvider.send('evm_revert', [snapshotId]);
      await truncateTables();

      await levelDBService?.deleteCache();
      await signKeyLevelDBService?.deleteCache();
      await levelDBService?.close();
      await signKeyLevelDBService?.close();
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

      // signature signed for amount=0, but deposit is made with amount=1 ETH —
      // on-chain deposit goes through, but beacon-chain activation is impossible
      const { signature: weirdSign } = await signDeposit(
        frontrunPK,
        frontrunSK,
        BAD_WC,
        0,
      );
      const { depositData } = await signDeposit(
        frontrunPK,
        frontrunSK,
        BAD_WC,
        1000000000,
      );
      await makeDeposit({ ...depositData, signature: weirdSign }, provider, 1);

      await waitForNewerBlock(currentBlock.number);
    });

    test('Increase staking limit', async () => {
      const currentBlock = await provider.getBlock('latest');
      // vet the added key (3 → 4)
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for curated operator', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });

    let depositCallsBeforeCycle: number;

    test('no unvetting will happen', async () => {
      depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;
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
      expectDepositsForModule(1, depositCallsBeforeCycle);
    });

    test('Staking limit stays at 4 (no unvetting)', async () => {
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

      await levelDBService?.deleteCache();
      await signKeyLevelDBService?.deleteCache();
      await levelDBService?.close();
      await signKeyLevelDBService?.close();
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
      // vetted key (3 → 4)
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

  // Wrong WC type: a used Lido key whose earliest deposit carries a VALID Lido WC
  // but of the wrong type (e.g. a 0x01-module key deposited with the 0x02 WC of
  // the CMv2 module, id 5). This is distinct from front-running (non-Lido WC) and
  // must trigger the same global hard pause (pauseDepositsV3).
  describe('Wrong WC type', () => {
    let snapshotId: number;
    let canRunTests = true;
    let wrongTypeWC: string;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      await waitKAPIUpdateModulesKeys();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);
      setupMocks();
      canRunTests = await canDeposit();
      console.log('canRunTests', canRunTests);

      // 0x02-type Lido WC, taken from the CMv2 community module (id 5)
      wrongTypeWC = await getModuleWC(5);
    }, 50_000);

    afterAll(async () => {
      jest.clearAllMocks();
      await testSetupProvider.send('evm_revert', [snapshotId]);
      await truncateTables();

      await levelDBService?.deleteCache();
      await signKeyLevelDBService?.deleteCache();
      await levelDBService?.close();
      await signKeyLevelDBService?.close();
    });

    const runIf = canRunTests ? test : test.skip;

    runIf('module 5 (CMv2) provides a 0x02-type Lido WC', () => {
      expect(wrongTypeWC.toLowerCase().startsWith('0x02')).toBe(true);
      // must be a real Lido WC, just of a different type than module 1
      expect(wrongTypeWC.toLowerCase()).not.toEqual(lidoWC.toLowerCase());
      expect(wrongTypeWC.slice(4)).toEqual(lidoWC.slice(4));
    });

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
      // vetted key (3 → 4)
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

    runIf(
      'Set cache: earliest deposit of used key has Lido WC of wrong type',
      async () => {
        const currentBlock = await provider.getBlock('latest');
        const { signature: wrongTypeSign } = await signDeposit(
          frontrunPK,
          frontrunSK,
          wrongTypeWC,
        );

        await levelDBService.setCachedEvents({
          data: [
            {
              valid: true,
              pubkey: toHexString(frontrunPK),
              amount: '32000000000',
              wc: wrongTypeWC,
              signature: toHexString(wrongTypeSign),
              tx: '0x124',
              blockHash: currentBlock.hash,
              blockNumber: currentBlock.number - 8,
              logIndex: 1,
              depositCount: 1,
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
      },
    );

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

  // Cross-type keys: a VETTED-UNUSED key in a 0x01 module whose deposit history
  // carries a VALID Lido WC of another type (e.g. the 0x02 WC of CMv2, id 5).
  // Unlike wrong-WC-type (used keys → global pause), this is a per-module issue:
  // the daemon unvets the key for that module and does NOT pause. No real Lido
  // deposit is needed (the key stays unused), so there is no canDeposit() gate.
  describe('Cross-type keys', () => {
    let snapshotId: number;
    let wrongTypeWC: string;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      await waitKAPIUpdateModulesKeys();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);
      setupMocks();

      // top up Lido buffer so module 1 would have allocation for deposits
      await fillLidoBuffer(2);

      // 0x02-type Lido WC, taken from the CMv2 community module (id 5)
      wrongTypeWC = await getModuleWC(5);
    }, 50_000);

    afterAll(async () => {
      jest.clearAllMocks();
      await testSetupProvider.send('evm_revert', [snapshotId]);
      await truncateTables();

      await levelDBService?.deleteCache();
      await signKeyLevelDBService?.deleteCache();
      await levelDBService?.close();
      await signKeyLevelDBService?.close();
    });

    test('module 5 (CMv2) provides a 0x02-type Lido WC', () => {
      expect(wrongTypeWC.toLowerCase().startsWith('0x02')).toBe(true);
      expect(wrongTypeWC.toLowerCase()).not.toEqual(lidoWC.toLowerCase());
      expect(wrongTypeWC.slice(4)).toEqual(lidoWC.slice(4));
    });

    test('Add valid key and raise staking limit to vet it', async () => {
      const currentBlock = await provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(validPK),
        toHexString(validDepositSignature),
        firstOperator.rewardAddress,
      );
      // after cut vetted=3, deposited=3. Bump vetted to 4 to vet the new valid key.
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Add cross-type key and vet it (stays unused)', async () => {
      const currentBlock = await provider.getBlock('latest');
      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(frontrunPK),
        toHexString(lidoDepositSignature),
        firstOperator.rewardAddress,
      );
      // vetted=4 → 5: vet the cross-type key (index 4), still unused
      await nor.setStakingLimit(firstOperator.index, 5);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for curated operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(5);
    });

    test('Set cache: vetted-unused key has a deposit with wrong-type Lido WC', async () => {
      const currentBlock = await provider.getBlock('latest');
      const { signature: wrongTypeSign } = await signDeposit(
        frontrunPK,
        frontrunSK,
        wrongTypeWC,
      );

      await levelDBService.setCachedEvents({
        data: [
          {
            valid: true,
            pubkey: toHexString(frontrunPK),
            amount: '32000000000',
            wc: wrongTypeWC,
            signature: toHexString(wrongTypeSign),
            tx: '0x125',
            blockHash: currentBlock.hash,
            blockNumber: currentBlock.number - 8,
            logIndex: 1,
            depositCount: 1,
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

    test('Unvetting of the cross-type key', async () => {
      const currentBlock = await provider.getBlock('latest');
      const depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;
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
          operatorIds: packNodeOperatorIds([firstOperator.index]),
          // unvet back to 4: keep valid key, drop cross-type key
          vettedKeysByOperator: '0x00000000000000000000000000000004',
        }),
      );
      expectNoDepositsForModule(1, depositCallsBeforeCycle);
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

    test('Check staking limit for curated operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });
});
