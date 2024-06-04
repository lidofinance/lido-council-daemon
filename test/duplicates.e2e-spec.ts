// Global Helpers
import { ethers } from 'ethers';
import { toHexString } from '@chainsafe/ssz';

// Helpers
import {
  mockedDvtOperators,
  mockedKeysApiFind,
  mockedKeysApiGetAllKeys,
  mockedKeysApiOperatorsMany,
  mockedMeta,
  mockedModule,
  mockedModuleDvt,
  mockedOperators,
} from './helpers';

// Constants
import { WeiPerEther } from '@ethersproject/constants';
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  STAKING_ROUTER,
  GOOD_WC,
  BAD_WC,
  CHAIN_ID,
  FORK_BLOCK,
  GANACHE_PORT,
  sk,
  pk,
  NOP_REGISTRY,
  FAKE_SIMPLE_DVT,
} from './constants';

// Contract Factories
import { StakingRouterAbi__factory } from './../src/generated';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import { setupTestingModule, closeServer } from './helpers/test-setup';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
import { LevelDBService } from 'contracts/deposit/leveldb';
import { makeDeposit } from './helpers/deposit';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';
import { ProviderService } from 'provider';
import { DepositService } from 'contracts/deposit';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { WalletService } from 'wallet';
import { SecurityService } from 'contracts/security';
import { Server } from 'ganache';
import { GuardianMessageService } from 'guardian/guardian-message';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';

describe('ganache e2e tests', () => {
  let server: Server<'ethereum'>;
  let providerService: ProviderService;
  let walletService: WalletService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let depositService: DepositService;
  let securityService: SecurityService;
  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;
  let getFrontRunAttempts: jest.SpyInstance;
  let levelDBService: LevelDBService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let signingKeyEventsCacheService: SigningKeyEventsCacheService;
  let stakingModuleGuardService: StakingModuleGuardService;
  let guardianMessageService: GuardianMessageService;

  beforeEach(async () => {
    ({
      server,
      providerService,
      walletService,
      keysApiService,
      guardianService,
      depositService,
      securityService,
      guardianMessageService,
      stakingModuleGuardService,
      levelDBService,
      signKeyLevelDBService,
      signingKeyEventsCacheService,
    } = await setupTestingModule());

    sendDepositMessage = jest
      .spyOn(guardianMessageService, 'sendDepositMessage')
      .mockImplementation(() => Promise.resolve());
    sendPauseMessage = jest
      .spyOn(guardianMessageService, 'sendPauseMessageV2')
      .mockImplementation(() => Promise.resolve());
    getFrontRunAttempts = jest.spyOn(
      stakingModuleGuardService,
      'getFrontRunAttempts',
    );
  });

  afterEach(async () => {
    await closeServer(server, levelDBService, signKeyLevelDBService);
  });

  describe('node checks', () => {
    test('correctness network', async () => {
      const chainId = await providerService.getChainId();
      expect(chainId).toBe(CHAIN_ID);
    });

    test('ability to create new blocks', async () => {
      const isMining = await providerService.provider.send('eth_mining', []);
      expect(isMining).toBe(true);
    });

    test('correctness block number', async () => {
      const provider = providerService.provider;
      const block = await provider.getBlock('latest');
      expect(block.number).toBe(FORK_BLOCK + 3);
    });

    test('testing address has some eth', async () => {
      const provider = providerService.provider;
      const balance = await provider.getBalance(walletService.address);
      expect(balance.gte(WeiPerEther.mul(34))).toBe(true);
    });

    test('curated module is not on pause', async () => {
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);
    });
  });

  test(
    'skip deposit if find duplicated key',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');

      const { wallet } = await makeDeposit(pk, sk, providerService);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const stakingDvtModule = mockedModuleDvt(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [
          { operators: mockedOperators, module: stakingModule },
          { operators: mockedDvtOperators, module: stakingDvtModule },
        ],
        meta,
      );

      // list of keys for /keys?used=false mock
      const unusedKeys = [
        {
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
        {
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 1,
          moduleAddress: NOP_REGISTRY,
        },
        {
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 3,
          moduleAddress: NOP_REGISTRY,
        },
        {
          key: '0xa9e4c3d9b71b82ae78da55a686208bb2b6b0b31f7a100f2d9ea46beb86088432dc3d320ccebadef9563e8be4c6ad8e63',
          depositSignature:
            '0xadfcf17804e128039df67d7ecf9f4312bbc17eacd57c76539a4d8cbb7e02cba246083200dd95bd5a83fdfcbcbf7051001432f2aef4e867f9cb426e850744a66b8842ebdb8d22d26bf7531ebdcc72e7dbae608fd4c5dde4a7bf43e65aff002c37',
          operatorIndex: 0,
          used: false,
          moduleAddress: FAKE_SIMPLE_DVT,
          index: 0,
        },
      ];

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);

      // Check that module was not paused
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);

      const originalIsDepositsPaused = securityService.isModuleDepositsPaused;

      // as we have faked simple dvt
      jest
        .spyOn(securityService, 'isModuleDepositsPaused')
        .mockImplementation((stakingModuleId, blockTag) => {
          if (stakingModuleId === stakingDvtModule.id) {
            return Promise.resolve(false);
          }
          return originalIsDepositsPaused.call(
            securityService,
            stakingModuleId,
            blockTag,
          );
        });

      await guardianService.handleNewBlock();

      // just skip on this iteration deposit for Curated staking module
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: currentBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 2,
        }),
      );
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        {
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
        {
          key: '0xa9e4c3d9b71b82ae78da55a686208bb2b6b0b31f7a100f2d9ea46beb86088432dc3d320ccebadef9563e8be4c6ad8e63',
          depositSignature:
            '0xadfcf17804e128039df67d7ecf9f4312bbc17eacd57c76539a4d8cbb7e02cba246083200dd95bd5a83fdfcbcbf7051001432f2aef4e867f9cb426e850744a66b8842ebdb8d22d26bf7531ebdcc72e7dbae608fd4c5dde4a7bf43e65aff002c37',
          operatorIndex: 0,
          used: false,
          moduleAddress: FAKE_SIMPLE_DVT,
          index: 0,
        },
      ];

      const newBlock = await tempProvider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(newBlock, newBlock.hash);
      const newStakingDvtModule = mockedModuleDvt(newBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [
          { operators: mockedOperators, module: newStakingModule },
          { operators: mockedDvtOperators, module: newStakingDvtModule },
        ],
        newMeta,
      );

      mockedKeysApiGetAllKeys(
        keysApiService,
        unusedKeysWithoutDuplicates,
        newMeta,
      );

      sendDepositMessage.mockClear();

      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendDepositMessage).toBeCalledTimes(2);

      // TODO: why prev example with toHaveBeenCalledWith didn't work
      expect(sendDepositMessage.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 1,
        }),
      );

      expect(sendDepositMessage.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 2,
        }),
      );

      jest.spyOn(securityService, 'isModuleDepositsPaused').mockRestore();
    },
    TESTS_TIMEOUT,
  );

  test(
    'skip deposit if find duplicated key in another staking module',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');

      const { wallet } = await makeDeposit(pk, sk, providerService);

      jest
        .spyOn(signingKeyEventsCacheService, 'getStakingModules')
        .mockImplementation(() =>
          Promise.resolve([NOP_REGISTRY, FAKE_SIMPLE_DVT]),
        );

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const stakingDvtModule = mockedModuleDvt(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [
          { operators: mockedOperators, module: stakingModule },
          { operators: mockedDvtOperators, module: stakingDvtModule },
        ],
        meta,
      );

      // list of keys for /keys?used=false mock
      const unusedKeys = [
        {
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
        {
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: FAKE_SIMPLE_DVT,
        },
      ];

      await signingKeyEventsCacheService.setCachedEvents({
        data: [
          {
            key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
            operatorIndex: 0,
            moduleAddress: NOP_REGISTRY,
            logIndex: 1,
            blockNumber: currentBlock.number,
            blockHash: currentBlock.hash,
          },
          {
            key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
            operatorIndex: 0,
            moduleAddress: FAKE_SIMPLE_DVT,
            logIndex: 2,
            blockNumber: currentBlock.number,
            blockHash: currentBlock.hash,
          },
        ],
        headers: {
          startBlock: currentBlock.number - 2,
          endBlock: currentBlock.number - 1,
          stakingModulesAddresses: [NOP_REGISTRY, FAKE_SIMPLE_DVT],
        },
      });

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);

      // Check that module was not paused
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        {
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
        {
          key: '0xa9e4c3d9b71b82ae78da55a686208bb2b6b0b31f7a100f2d9ea46beb86088432dc3d320ccebadef9563e8be4c6ad8e63',
          depositSignature:
            '0xadfcf17804e128039df67d7ecf9f4312bbc17eacd57c76539a4d8cbb7e02cba246083200dd95bd5a83fdfcbcbf7051001432f2aef4e867f9cb426e850744a66b8842ebdb8d22d26bf7531ebdcc72e7dbae608fd4c5dde4a7bf43e65aff002c37',
          operatorIndex: 0,
          used: false,
          moduleAddress: FAKE_SIMPLE_DVT,
          index: 0,
        },
      ];

      const newBlock = await tempProvider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(newBlock, newBlock.hash);
      const newStakingDvtModule = mockedModuleDvt(newBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [
          { operators: mockedOperators, module: newStakingModule },
          { operators: mockedDvtOperators, module: newStakingDvtModule },
        ],
        newMeta,
      );

      mockedKeysApiGetAllKeys(
        keysApiService,
        unusedKeysWithoutDuplicates,
        newMeta,
      );

      const originalIsDepositsPaused = securityService.isModuleDepositsPaused;

      // as we have faked simple dvt
      jest
        .spyOn(securityService, 'isModuleDepositsPaused')
        .mockImplementation((stakingModuleId, blockTag) => {
          if (stakingModuleId === newStakingDvtModule.id) {
            return Promise.resolve(false);
          }
          return originalIsDepositsPaused.call(
            securityService,
            stakingModuleId,
            blockTag,
          );
        });

      sendDepositMessage.mockClear();

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(2);

      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 1,
        }),
      );

      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 2,
        }),
      );

      jest.spyOn(securityService, 'isModuleDepositsPaused').mockRestore();
    },
    TESTS_TIMEOUT,
  );

  test(
    'added unused keys for that deposit was already made',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');

      const { wallet, deposit_sign } = await makeDeposit(
        pk,
        sk,
        providerService,
      );

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: stakingModule }],
        meta,
      );

      const unusedKeys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(deposit_sign),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      const keys = [
        ...unusedKeys,
        { ...unusedKeys[0], operatorIndex: 1, used: true },
      ];
      mockedKeysApiGetAllKeys(keysApiService, keys, meta);

      // Check that module was not paused
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);

      await guardianService.handleNewBlock();

      // deposit will be skipped until unvetting
      // so list of keys can be changed
      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module

      const newBlock = await tempProvider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: newStakingModule }],
        newMeta,
      );

      mockedKeysApiGetAllKeys(
        keysApiService,
        [{ ...unusedKeys[0], operatorIndex: 1, used: true }],
        newMeta,
      );

      sendDepositMessage.mockClear();

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(1);

      expect(sendDepositMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 1,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  // TODO: test('adding not vetted duplicate will not set on soft pause module')
  // that is a case that we had vetted unused keys and someone added unvetted unused key after
  // we should define first key as original, second as duplicate, but as second key is not vetted we should filter it from final result
  // and not set soft pause of this key

  test(
    'duplicates will not block front-run recognition',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const forkBlock = await tempProvider.getBlock(FORK_BLOCK);
      const currentBlock = await tempProvider.getBlock('latest');

      const { deposit_sign: goodSig } = await makeDeposit(
        pk,
        sk,
        providerService,
      );

      const unusedKeys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSig),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      const meta = mockedMeta(currentBlock, currentBlock.hash);
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: stakingModule }],
        meta,
      );

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);
      mockedKeysApiFind(keysApiService, unusedKeys, meta);

      // just to start checks set event in cache
      await depositService.setCachedEvents({
        data: [
          {
            valid: true,
            pubkey: toHexString(pk),
            amount: '32000000000',
            wc: GOOD_WC,
            signature: toHexString(goodSig),
            tx: '0x123',
            blockHash: forkBlock.hash,
            blockNumber: forkBlock.number,
            logIndex: 1,
            depositCount: 1,
            depositDataRoot: new Uint8Array(),
            index: '',
          },
        ],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();

      expect(getFrontRunAttempts).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledTimes(1);

      await makeDeposit(pk, sk, providerService, BAD_WC);

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const updatedStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: updatedStakingModule }],
        newMeta,
      );

      const duplicate = {
        key: toHexString(pk),
        depositSignature: toHexString(goodSig),
        operatorIndex: 0,
        used: false,
        index: 1,
        moduleAddress: NOP_REGISTRY,
      };

      mockedKeysApiGetAllKeys(
        keysApiService,
        [...unusedKeys, duplicate],
        newMeta,
      );

      sendDepositMessage.mockClear();
      getFrontRunAttempts.mockClear();

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);

      expect(getFrontRunAttempts).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );
});
