// Global Helpers
import { toHexString } from '@chainsafe/ssz';

// Constants
import { SLEEP_FOR_RESULT, pk, sk, NO_PRIVKEY_MESSAGE } from './constants';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { SecurityService } from 'contracts/security';
import { GuardianService } from 'guardian';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { GuardianMessageService } from 'guardian/guardian-message';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';

import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import {
  addGuardians,
  fillLidoBuffer,
  getGuardians,
  getLidoWC,
  getSecurityContract,
  getSecurityOwner,
} from './helpers/dsm';
import { signDeposit } from './helpers/deposit';
import { BlsService } from 'bls';
import { DepositIntegrityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import {
  accountImpersonate,
  setBalance,
  testSetupProvider,
} from './helpers/provider';
import { waitForNewerBlock, waitKAPIUpdateModulesKeys } from './helpers/kapi';
import { CuratedOnchainV1 } from './helpers/nor.contract';
import { truncateTables } from './helpers/pg';
import { packNodeOperatorIds } from 'guardian/unvetting/bytes';
import { getStakingModulesInfo } from './helpers/sr.contract';
import { ethers } from 'ethers';
import {
  setupContainers,
  startContainerIfNotRunning,
} from './helpers/docker-containers/utils';
import { HardhatServer } from './helpers/hardhat-server';
import { cutModulesKeys } from './helpers/reduce-keys';

jest.setTimeout(300_000);

describe('Guardian balance ', () => {
  let provider: SimpleFallbackJsonRpcBatchProvider;
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

    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);

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

  const getNewDepositMessages = (fromCallIndex: number) => {
    return sendDepositMessage.mock.calls
      .slice(fromCallIndex)
      .map(([message]) => message as { stakingModuleId: number });
  };

  const expectDepositsStillWork = (fromCallIndex = 0) => {
    expect(getNewDepositMessages(fromCallIndex).length).toBeGreaterThan(0);
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
  let stakingModulesCount: number;
  let firstOperator: any;
  let nor: CuratedOnchainV1;
  const validPK: Uint8Array = pk;
  let validDepositSignature: Uint8Array;
  let lidoWC: string;
  let guardianIndex: number;
  let securityModuleAddress: string;
  let guardianAddress: string;

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

    stakingModulesCount = stakingModulesAddresses.length;

    // get two different active operators
    nor = new CuratedOnchainV1(curatedModuleAddress);
    const activeOperators = await nor.getActiveOperators();
    firstOperator = activeOperators[0];

    lidoWC = await getLidoWC();
    const { signature } = await signDeposit(validPK, sk, lidoWC);
    validDepositSignature = signature;

    if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
    const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
    guardianAddress = wallet.address;
  }, 360_000);

  afterAll(async () => {
    await keysApiContainer.stop();
    await hardhatServer.stop();
    await postgresContainer.stop();
  }, 40_000);

  describe('Unvetting will not happen if guardian balance lower critical threshold', () => {
    let snapshotId: number;

    beforeAll(async () => {
      snapshotId = await testSetupProvider.send('evm_snapshot', []);
      await waitKAPIUpdateModulesKeys();

      const moduleRef = await setupTestingModule();
      await setupTestingServices(moduleRef);
      setupMocks();

      // top up Lido buffer so module 1 has allocation for deposits
      await fillLidoBuffer(1);
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

    test('Add valid key and raise staking limit', async () => {
      const currentBlock = await provider.getBlock('latest');

      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(validPK),
        toHexString(validDepositSignature),
        firstOperator.rewardAddress,
      );
      // after cut vetted=3, deposited=3. Bump vetted to 4 to vet the valid key.
      await nor.setStakingLimit(firstOperator.index, 4);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Add key with broken signature', async () => {
      const currentBlock = await provider.getBlock('latest');
      const brokenPK = new Uint8Array(48).fill(2);
      const randomSign =
        '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e';

      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(brokenPK),
        randomSign,
        firstOperator.rewardAddress,
      );
      await waitForNewerBlock(currentBlock.number);
    });

    test('Unvetted key will not set module on soft pause', async () => {
      const depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(validateKeys).toHaveBeenCalledTimes(stakingModulesCount);
      expect(sendUnvetMessage).toHaveBeenCalledTimes(0);
      expectDepositsStillWork(depositCallsBeforeCycle);
    });

    test('Increase staking limit to vet the broken key', async () => {
      const currentBlock = await provider.getBlock('latest');
      await nor.setStakingLimit(firstOperator.index, 5);
      await waitForNewerBlock(currentBlock.number);
    });

    test('Check staking limit for operator before unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(5);
    });

    test('Unvetting transaction will not be sent due to low account balance', async () => {
      await setBalance(guardianAddress, 0.2);
      const depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(validateKeys).toHaveBeenCalledTimes(2 * stakingModulesCount);
      expect(sendUnvetMessage).toHaveBeenCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledTimes(0);
      expectNoDepositsForModule(1, depositCallsBeforeCycle);
    }, 60_000);

    test('Add another key with broken signature to make kapi update state', async () => {
      const currentBlock = await provider.getBlock('latest');
      const brokenPK2 = new Uint8Array(48).fill(3);
      const randomSign =
        '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e';

      await nor.addSigningKey(
        firstOperator.index,
        1,
        toHexString(brokenPK2),
        randomSign,
        firstOperator.rewardAddress,
      );
      await waitForNewerBlock(currentBlock.number);
    });

    test('After increase account balance, unvetting transaction will be sent', async () => {
      const currentBlock = await provider.getBlock('latest');

      await setBalance(guardianAddress, 1);
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(validateKeys).toHaveBeenCalledTimes(3 * stakingModulesCount);
      expect(sendUnvetMessage).toHaveBeenCalledTimes(2);
      expect(sendUnvetMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: guardianAddress,
          guardianIndex,
          stakingModuleId: 1,
          operatorIds: packNodeOperatorIds([firstOperator.index]),
          // unvet to 4: keep valid key at index 3, drop broken key at index 4
          vettedKeysByOperator: '0x00000000000000000000000000000004',
        }),
      );

      expect(unvetSigningKeys).toHaveBeenCalledTimes(1);
      expect(unvetSigningKeys).toHaveBeenCalledWith(
        expect.anything(),
        currentBlock.number,
        expect.anything(),
        1,
        packNodeOperatorIds([firstOperator.index]),
        '0x00000000000000000000000000000004',
        expect.any(Object),
      );
    }, 60_000);

    test('Deposits resume for module after unvetting', async () => {
      const currentBlock = await provider.getBlock('latest');
      // mine a new block so handleNewBlock doesn't bail out with "block has not changed"
      await testSetupProvider.send('evm_mine', []);
      await waitForNewerBlock(currentBlock.number);

      const depositCallsBeforeCycle = sendDepositMessage.mock.calls.length;

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expectDepositsForModule(1, depositCallsBeforeCycle);
    });

    test('Check staking limit for operator after unvetting', async () => {
      const op = await nor.getOperator(firstOperator.index, false);
      expect(Number(op.totalVettedValidators)).toEqual(4);
    });
  });
});
