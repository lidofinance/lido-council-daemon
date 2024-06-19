// Global Helpers
import { ethers } from 'ethers';
import { fromHexString, toHexString } from '@chainsafe/ssz';

// Helpers
import {
  computeRoot,
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
  DEPOSIT_CONTRACT,
  GOOD_WC,
  BAD_WC,
  CHAIN_ID,
  FORK_BLOCK,
  GANACHE_PORT,
  NO_PRIVKEY_MESSAGE,
  sk,
  pk,
  NOP_REGISTRY,
  FAKE_SIMPLE_DVT,
} from './constants';

// Contract Factories
import {
  DepositAbi__factory,
  StakingRouterAbi__factory,
} from './../src/generated';

// BLS helpers

import { DepositData } from './../src/bls/bls.containers';

// App modules and services
import { setupTestingModule, closeServer } from './helpers/test-setup';
import { SecurityService } from 'contracts/security';
import { DepositService } from 'contracts/deposit';
import { GuardianService } from 'guardian';
import { KeysApiService } from 'keys-api/keys-api.service';
import { WalletService } from 'wallet';
import { ProviderService } from 'provider';
import { Server } from 'ganache';
import { LevelDBService } from 'contracts/deposit/leveldb';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { GuardianMessageService } from 'guardian/guardian-message';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

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
  let levelDBService: LevelDBService;
  let signKeyLevelDBService: SignKeyLevelDBService;
  let guardianMessageService: GuardianMessageService;
  let signingKeyEventsCacheService: SigningKeyEventsCacheService;

  beforeEach(async () => {
    ({
      server,
      providerService,
      walletService,
      keysApiService,
      guardianService,
      depositService,
      securityService,
      levelDBService,
      signKeyLevelDBService,
      guardianMessageService,
      signingKeyEventsCacheService,
    } = await setupTestingModule());

    sendDepositMessage = jest
      .spyOn(guardianMessageService, 'sendDepositMessage')
      .mockImplementation(() => Promise.resolve());
    sendPauseMessage = jest
      .spyOn(guardianMessageService, 'sendPauseMessageV2')
      .mockImplementation(() => Promise.resolve());
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
    'node operator deposit frontrun, this test shows how to make pause without need',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const forkBlock = await tempProvider.getBlock(FORK_BLOCK);
      const currentBlock = await tempProvider.getBlock('latest');

      // create correct sign for deposit message for pk
      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

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

      jest
        .spyOn(signingKeyEventsCacheService, 'getStakingModules')
        .mockImplementation(() =>
          Promise.resolve([NOP_REGISTRY, FAKE_SIMPLE_DVT]),
        );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, FAKE_SIMPLE_DVT],
        },
      });

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();

      const badDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(BAD_WC),
        amount: 1000000000, // gwei!
      };
      const badSigningRoot = computeRoot(badDepositMessage);
      const badSig = sk.sign(badSigningRoot).toBytes();

      const badDepositData = {
        ...badDepositMessage,
        signature: badSig,
      };
      const badDepositDataRoot = DepositData.hashTreeRoot(badDepositData);

      if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
      const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

      // Make a bad deposit
      const signer = wallet.connect(providerService.provider);
      const depositContract = DepositAbi__factory.connect(
        DEPOSIT_CONTRACT,
        signer,
      );
      await depositContract.deposit(
        badDepositData.pubkey,
        badDepositData.withdrawalCredentials,
        badDepositData.signature,
        badDepositDataRoot,
        { value: ethers.constants.WeiPerEther.mul(1) },
      );

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const updatedStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: updatedStakingModule }],
        newMeta,
      );

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);

      sendDepositMessage.mockReset();

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // now we need to check that deposit will not happen and pause will not happen too
      expect(sendDepositMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test(
    'node operator deposit frontrun, 2 modules in staking router',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const forkBlock = await tempProvider.getBlock(FORK_BLOCK);
      const currentBlock = await tempProvider.getBlock('latest');

      // create correct sign for deposit message for pk
      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

      const unusedKeys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSig),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
        // simple dvt
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

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);
      mockedKeysApiFind(keysApiService, unusedKeys, meta);

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

      jest
        .spyOn(signingKeyEventsCacheService, 'getStakingModules')
        .mockImplementation(() =>
          Promise.resolve([NOP_REGISTRY, FAKE_SIMPLE_DVT]),
        );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, FAKE_SIMPLE_DVT],
        },
      });

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

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();

      const badDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(BAD_WC),
        amount: 1000000000, // gwei!
      };
      const badSigningRoot = computeRoot(badDepositMessage);
      const badSig = sk.sign(badSigningRoot).toBytes();

      const badDepositData = {
        ...badDepositMessage,
        signature: badSig,
      };
      const badDepositDataRoot = DepositData.hashTreeRoot(badDepositData);

      if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
      const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

      // Make a bad deposit
      const signer = wallet.connect(providerService.provider);
      const depositContract = DepositAbi__factory.connect(
        DEPOSIT_CONTRACT,
        signer,
      );
      await depositContract.deposit(
        badDepositData.pubkey,
        badDepositData.withdrawalCredentials,
        badDepositData.signature,
        badDepositDataRoot,
        { value: ethers.constants.WeiPerEther.mul(1) },
      );

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const updatedStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [
          { operators: mockedOperators, module: updatedStakingModule },
          { operators: mockedDvtOperators, module: stakingDvtModule },
        ],
        newMeta,
      );

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);

      expect(sendDepositMessage).toBeCalledTimes(2);
      sendDepositMessage.mockReset();
      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // soft pause for 1 module, sign deposit for 2
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 2,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  test(
    'failed 1eth deposit attack to stop deposits (free money)',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');
      // mock kapi response
      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();
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
      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });
      jest
        .spyOn(signingKeyEventsCacheService, 'getStakingModules')
        .mockImplementation(() =>
          Promise.resolve([NOP_REGISTRY, FAKE_SIMPLE_DVT]),
        );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, FAKE_SIMPLE_DVT],
        },
      });

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();
      const badDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 1000000000, // gwei!
      };
      const badSigningRoot = computeRoot(badDepositMessage);
      const badSig = sk.sign(badSigningRoot).toBytes();
      const badDepositData = {
        ...badDepositMessage,
        signature: badSig,
      };
      const badDepositDataRoot = DepositData.hashTreeRoot(badDepositData);
      if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
      const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
      // Make a bad deposit
      const signer = wallet.connect(providerService.provider);
      const depositContract = DepositAbi__factory.connect(
        DEPOSIT_CONTRACT,
        signer,
      );
      await depositContract.deposit(
        badDepositData.pubkey,
        badDepositData.withdrawalCredentials,
        badDepositData.signature,
        badDepositDataRoot,
        { value: ethers.constants.WeiPerEther.mul(1) },
      );
      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(currentBlock, currentBlock.hash);
      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: newStakingModule }],
        newMeta,
      );
      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);
      // we make check that there are no duplicated used keys
      // this request return keys along with their duplicates
      mockedKeysApiFind(keysApiService, unusedKeys, newMeta);
      expect(sendDepositMessage).toBeCalledTimes(1);
      sendDepositMessage.mockReset();
      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));
      // Check if on pause now
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );

      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(1);
    },
    TESTS_TIMEOUT,
  );

  test(
    'failed 1eth deposit attack to stop deposits with a wrong signature and wc',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');
      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

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

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      jest
        .spyOn(signingKeyEventsCacheService, 'getStakingModules')
        .mockImplementation(() =>
          Promise.resolve([NOP_REGISTRY, FAKE_SIMPLE_DVT]),
        );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, FAKE_SIMPLE_DVT],
        },
      });

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();

      const badDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(BAD_WC),
        amount: 1000000000, // gwei!
      };

      // Weird sig
      const weirdDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(BAD_WC),
        amount: 0, // gwei!
      };
      const weirdSigningRoot = computeRoot(weirdDepositMessage);
      const weirdSig = sk.sign(weirdSigningRoot).toBytes();
      const badDepositData = {
        ...badDepositMessage,
        signature: weirdSig,
      };
      const badDepositDataRoot = DepositData.hashTreeRoot(badDepositData);
      if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
      const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
      // Make a bad deposit
      const signer = wallet.connect(providerService.provider);
      const depositContract = DepositAbi__factory.connect(
        DEPOSIT_CONTRACT,
        signer,
      );
      await depositContract.deposit(
        badDepositData.pubkey,
        badDepositData.withdrawalCredentials,
        badDepositData.signature,
        badDepositDataRoot,
        { value: ethers.constants.WeiPerEther.mul(1) },
      );
      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: newStakingModule }],
        newMeta,
      );

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);
      expect(sendDepositMessage).toBeCalledTimes(1);
      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));
      expect(sendPauseMessage).toBeCalledTimes(0);
      expect(sendDepositMessage).toBeCalledTimes(2);
    },
    TESTS_TIMEOUT,
  );

  test(
    'good scenario',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');

      // no diff
      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

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

      const goodDepositData = {
        ...goodDepositMessage,
        signature: goodSig,
      };
      const goodDepositDataRoot = DepositData.hashTreeRoot(goodDepositData);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      jest
        .spyOn(signingKeyEventsCacheService, 'getStakingModules')
        .mockImplementation(() =>
          Promise.resolve([NOP_REGISTRY, FAKE_SIMPLE_DVT]),
        );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, FAKE_SIMPLE_DVT],
        },
      });

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();

      if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
      const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

      // Make a deposit
      const signer = wallet.connect(providerService.provider);
      const depositContract = DepositAbi__factory.connect(
        DEPOSIT_CONTRACT,
        signer,
      );
      await depositContract.deposit(
        goodDepositData.pubkey,
        goodDepositData.withdrawalCredentials,
        goodDepositData.signature,
        goodDepositDataRoot,
        { value: ethers.constants.WeiPerEther.mul(32) },
      );

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: newStakingModule }],
        newMeta,
      );

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);
      mockedKeysApiFind(keysApiService, unusedKeys, newMeta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 6,
          stakingModuleId: 1,
        }),
      );

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      // Check if on pause now
      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );
      expect(isOnPause).toBe(false);
    },
    TESTS_TIMEOUT,
  );

  test(
    'inconsistent kapi requests data',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');

      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

      const goodDepositData = {
        ...goodDepositMessage,
        signature: goodSig,
      };
      const goodDepositDataRoot = DepositData.hashTreeRoot(goodDepositData);

      if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
      const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

      // Make a deposit
      const signer = wallet.connect(providerService.provider);
      const depositContract = DepositAbi__factory.connect(
        DEPOSIT_CONTRACT,
        signer,
      );
      await depositContract.deposit(
        goodDepositData.pubkey,
        goodDepositData.withdrawalCredentials,
        goodDepositData.signature,
        goodDepositDataRoot,
        { value: ethers.constants.WeiPerEther.mul(32) },
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
          key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
          depositSignature:
            '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      const hashWasChanged =
        '0xd921055dbb407e09f64afe5182a64c1bd309fe28f26909a96425cdb6bfc48959';
      const newMeta = mockedMeta(currentBlock, hashWasChanged);
      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test(
    'historical front-run',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');

      // create correct sign for deposit message for pk
      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

      const keys = [
        {
          key: toHexString(pk),
          depositSignature: toHexString(goodSig),
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: stakingModule }],
        meta,
      );

      mockedKeysApiGetAllKeys(keysApiService, keys, meta);
      mockedKeysApiFind(keysApiService, keys, meta);

      // make bad deposit
      const badDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(BAD_WC),
        amount: 1000000000, // gwei!
      };
      const badSigningRoot = computeRoot(badDepositMessage);
      const badSig = sk.sign(badSigningRoot).toBytes();

      await depositService.setCachedEvents({
        data: [
          {
            valid: true,
            pubkey: toHexString(pk),
            amount: '32000000000',
            wc: BAD_WC,
            signature: toHexString(badSig),
            tx: '0x122',
            blockHash: '0x123456',
            blockNumber: currentBlock.number - 1,
            logIndex: 1,
            depositCount: 1,
            depositDataRoot: new Uint8Array(),
            index: '',
          },
          {
            valid: true,
            pubkey: toHexString(pk),
            amount: '32000000000',
            wc: GOOD_WC,
            signature: toHexString(goodSig),
            tx: '0x123',
            blockHash: currentBlock.hash,
            blockNumber: currentBlock.number,
            logIndex: 1,
            depositCount: 2,
            depositDataRoot: new Uint8Array(),
            index: '',
          },
        ],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
        },
      });

      jest
        .spyOn(signingKeyEventsCacheService, 'getStakingModules')
        .mockImplementation(() =>
          Promise.resolve([NOP_REGISTRY, FAKE_SIMPLE_DVT]),
        );

      await signingKeyEventsCacheService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          stakingModulesAddresses: [NOP_REGISTRY, FAKE_SIMPLE_DVT],
        },
      });

      await guardianService.handleNewBlock();

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      expect(sendPauseMessage).toBeCalledTimes(1);
      expect(sendDepositMessage).toBeCalledTimes(0);

      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPause = await routerContract.getStakingModuleIsDepositsPaused(
        1,
      );

      expect(isOnPause).toBe(true);
    },
    TESTS_TIMEOUT,
  );

  // test(
  //   'reorganization',
  //   async () => {
  //     const tempProvider = new ethers.providers.JsonRpcProvider(
  //       `http://127.0.0.1:${GANACHE_PORT}`,
  //     );
  //     const currentBlock = await tempProvider.getBlock('latest');

  //     const goodDepositMessage = {
  //       pubkey: pk,
  //       withdrawalCredentials: fromHexString(GOOD_WC),
  //       amount: 32000000000, // gwei!
  //     };
  //     const goodSigningRoot = computeRoot(goodDepositMessage);
  //     const goodSig = sk.sign(goodSigningRoot).toBytes();

  //     const unusedKeys = [
  //       {
  //         key: toHexString(pk),
  //         depositSignature: toHexString(goodSig),
  //         operatorIndex: 0,
  //         used: false,
  //         index: 0,
  //         moduleAddress: NOP_REGISTRY,
  //       },
  //     ];

  //     const meta = mockedMeta(currentBlock, currentBlock.hash);
  //     const stakingModule = mockedModule(currentBlock, currentBlock.hash);

  //     mockedKeysApiOperators(
  //       keysApiService,
  //       mockedOperators,
  //       stakingModule,
  //       meta,
  //     );

  //     mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);

  //     const goodDepositData = {
  //       ...goodDepositMessage,
  //       signature: goodSig,
  //     };
  //     const goodDepositDataRoot = DepositData.hashTreeRoot(goodDepositData);

  //     await depositService.setCachedEvents({
  //       data: [],
  //       headers: {
  //         startBlock: currentBlock.number,
  //         endBlock: currentBlock.number,
  //         version: '1',
  //       },
  //     });

  //     // Check if the service is ok and ready to go
  //     await guardianService.handleNewBlock();

  //     // Wait for possible changes
  //     await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

  //     const routerContract = StakingRouterAbi__factory.connect(
  //       STAKING_ROUTER,
  //       providerService.provider,
  //     );
  //     const isOnPauseBefore =
  //       await routerContract.getStakingModuleIsDepositsPaused(1);
  //     expect(isOnPauseBefore).toBe(false);

  //     if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
  //     const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

  //     // Make a deposit
  //     const signer = wallet.connect(providerService.provider);
  //     const depositContract = DepositAbi__factory.connect(
  //       DEPOSIT_CONTRACT,
  //       signer,
  //     );
  //     await depositContract.deposit(
  //       goodDepositData.pubkey,
  //       goodDepositData.withdrawalCredentials,
  //       goodDepositData.signature,
  //       goodDepositDataRoot,
  //       { value: ethers.constants.WeiPerEther.mul(32) },
  //     );

  //     // Mock Keys API again on new block, but now mark as used
  //     const newBlock = await providerService.provider.getBlock('latest');
  //     const newMeta = mockedMeta(newBlock, newBlock.hash);
  //     const newStakingModule = mockedModule(currentBlock, newBlock.hash);

  //     mockedKeysApiOperators(
  //       keysApiService,
  //       mockedOperators,
  //       newStakingModule,
  //       newMeta,
  //     );

  //     mockedKeysApiGetAllKeys(
  //       keysApiService,
  //       [
  //         {
  //           key: toHexString(pk),
  //           depositSignature: toHexString(goodSig),
  //           operatorIndex: 0,
  //           used: true,
  //           index: 0,
  //           moduleAddress: NOP_REGISTRY,
  //         },
  //       ],
  //       newMeta,
  //     );

  //     // Run a cycle and wait for possible changes
  //     await guardianService.handleNewBlock();
  //     await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

  //     const isOnPauseMiddle =
  //       await routerContract.getStakingModuleIsDepositsPaused(1);
  //     expect(isOnPauseMiddle).toBe(false);

  //     // Simulating a reorg
  //     await server.close();
  //     server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
  //     await server.listen(GANACHE_PORT);

  //     mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);
  //     mockedKeysApiFind(keysApiService, unusedKeys, newMeta);

  //     // Check if on pause now
  //     const isOnPauseAfter =
  //       await routerContract.getStakingModuleIsDepositsPaused(1);
  //     expect(isOnPauseAfter).toBe(false);
  //   },
  //   TESTS_TIMEOUT,
  // );
});
