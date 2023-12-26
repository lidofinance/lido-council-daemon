import { Test } from '@nestjs/testing';

// Global Helpers
import { ethers } from 'ethers';
import { fromHexString, toHexString } from '@chainsafe/ssz';

// Helpers
import {
  computeRoot,
  mockedKeysApiOperators,
  mockedKeysApiUnusedKeys,
  mockedKeysWithDuplicates,
  mockedMeta,
  mockedModule,
  mockedOperators,
} from './helpers';

// Constants
import { WeiPerEther } from '@ethersproject/constants';
import {
  TESTS_TIMEOUT,
  SLEEP_FOR_RESULT,
  SECURITY_MODULE,
  SECURITY_MODULE_OWNER,
  STAKING_ROUTER,
  DEPOSIT_CONTRACT,
  GOOD_WC,
  BAD_WC,
  CHAIN_ID,
  FORK_BLOCK,
  UNLOCKED_ACCOUNTS,
  GANACHE_PORT,
  NO_PRIVKEY_MESSAGE,
  sk,
  pk,
  NOP_REGISTRY,
} from './constants';

// Ganache
import { makeServer } from './server';

// Contract Factories
import {
  DepositAbi__factory,
  SecurityAbi__factory,
  StakingRouterAbi__factory,
} from './../src/generated';

// BLS helpers

import { DepositData } from './../src/bls/bls.containers';

// App modules and services

import { PrometheusModule } from '../src/common/prometheus';
import { LoggerModule } from '../src/common/logger';
import { ConfigModule } from '../src/common/config';

import { GuardianService } from '../src/guardian';
import { GuardianModule } from '../src/guardian';

import { WalletService } from '../src/wallet';
import { WalletModule } from '../src/wallet';

import { RepositoryModule } from '../src/contracts/repository';

import { DepositService } from '../src/contracts/deposit';
import { DepositModule } from '../src/contracts/deposit';

import { SecurityModule } from '../src/contracts/security';

import { LidoService } from '../src/contracts/lido';
import { LidoModule } from '../src/contracts/lido';

import { KeysApiService } from '../src/keys-api/keys-api.service';
import { KeysApiModule } from '../src/keys-api/keys-api.module';

import { ProviderService } from '../src/provider';
import { GanacheProviderModule } from '../src/provider';

import { BlsService } from '../src/bls';
import { GuardianMessageService } from '../src/guardian/guardian-message';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

describe('ganache e2e tests', () => {
  let server: ReturnType<typeof makeServer>;

  let providerService: ProviderService;
  let walletService: WalletService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let lidoService: LidoService;
  let depositService: DepositService;
  let blsService: BlsService;
  let guardianMessageService: GuardianMessageService;

  let sendDepositMessage: jest.SpyInstance;
  let sendPauseMessage: jest.SpyInstance;

  let keyValidator: KeyValidatorInterface;
  let validateKeys: jest.SpyInstance;

  beforeEach(async () => {
    server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
    await server.listen(GANACHE_PORT);
  });

  afterEach(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Prepare a signer for the unlocked Ganache account
    if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
    const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);
    const tempProvider = new ethers.providers.JsonRpcProvider(
      `http://127.0.0.1:${GANACHE_PORT}`,
    );
    const tempSigner = tempProvider.getSigner(SECURITY_MODULE_OWNER);

    // Add our address to guardians and set consensus to 1
    const securityContract = SecurityAbi__factory.connect(
      SECURITY_MODULE,
      tempSigner,
    );
    await securityContract.functions.addGuardian(wallet.address, 1);

    const moduleRef = await Test.createTestingModule({
      imports: [
        GanacheProviderModule.forRoot(),
        ConfigModule.forRoot(),
        PrometheusModule,
        LoggerModule,
        GuardianModule,
        RepositoryModule,
        WalletModule,
        KeysApiModule,
        LidoModule,
        DepositModule,
        SecurityModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    walletService = moduleRef.get(WalletService);
    keysApiService = moduleRef.get(KeysApiService);
    guardianService = moduleRef.get(GuardianService);
    lidoService = moduleRef.get(LidoService);
    depositService = moduleRef.get(DepositService);
    guardianMessageService = moduleRef.get(GuardianMessageService);
    keyValidator = moduleRef.get(KeyValidatorInterface);

    // Initializing needed service instead of the whole app
    blsService = moduleRef.get(BlsService);
    await blsService.onModuleInit();

    jest
      .spyOn(lidoService, 'getWithdrawalCredentials')
      .mockImplementation(async () => GOOD_WC);

    jest
      .spyOn(guardianMessageService, 'pingMessageBroker')
      .mockImplementation(() => Promise.resolve());
    sendDepositMessage = jest
      .spyOn(guardianMessageService, 'sendDepositMessage')
      .mockImplementation(() => Promise.resolve());
    sendPauseMessage = jest
      .spyOn(guardianMessageService, 'sendPauseMessage')
      .mockImplementation(() => Promise.resolve());

    validateKeys = jest.spyOn(keyValidator, 'validateKeys');
  });

  describe('node checks', () => {
    it('should be on correct network', async () => {
      const chainId = await providerService.getChainId();
      expect(chainId).toBe(CHAIN_ID);
    });

    it('should be able to create new blocks', async () => {
      const isMining = await providerService.provider.send('eth_mining', []);
      expect(isMining).toBe(true);
    });

    it('should be on correct block number', async () => {
      const provider = providerService.provider;
      const block = await provider.getBlock('latest');
      expect(block.number).toBe(FORK_BLOCK + 2);
    });

    it('testing address should have some eth', async () => {
      const provider = providerService.provider;
      const balance = await provider.getBalance(walletService.address);
      expect(balance.gte(WeiPerEther.mul(34))).toBe(true);
    });

    it('needed contract should not be already on pause', async () => {
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
    'node operator deposit frontrun',
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, meta);
      mockedKeysWithDuplicates(keysApiService, unusedKeys, meta);

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
          },
        ],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          version: '1',
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        updatedStakingModule,
        newMeta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, newMeta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();

      expect(sendPauseMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 9,
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
      expect(isOnPause).toBe(true);
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, meta);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          version: '1',
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        newStakingModule,
        newMeta,
      );
      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, newMeta);
      // we make check that there are no duplicated used keys
      // this request return keys along with their duplicates
      mockedKeysWithDuplicates(keysApiService, unusedKeys, newMeta);

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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, meta);

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          version: '1',
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        newStakingModule,
        newMeta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, newMeta);
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, meta);

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
          version: '1',
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        newStakingModule,
        newMeta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, newMeta);
      mockedKeysWithDuplicates(keysApiService, unusedKeys, newMeta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 9,
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
    'reorganization',
    async () => {
      // TODO: need attention to this test
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, meta);

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
          version: '1',
        },
      });

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();

      // Wait for possible changes
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const routerContract = StakingRouterAbi__factory.connect(
        STAKING_ROUTER,
        providerService.provider,
      );
      const isOnPauseBefore =
        await routerContract.getStakingModuleIsDepositsPaused(1);
      expect(isOnPauseBefore).toBe(false);

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

      // Mock Keys API again on new block, but now mark as used
      const newBlock = await providerService.provider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        newStakingModule,
        newMeta,
      );

      mockedKeysApiUnusedKeys(keysApiService, [], newMeta);

      // Run a cycle and wait for possible changes
      await guardianService.handleNewBlock();
      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const isOnPauseMiddle =
        await routerContract.getStakingModuleIsDepositsPaused(1);
      expect(isOnPauseMiddle).toBe(false);

      // Simulating a reorg
      await server.close();
      server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
      await server.listen(GANACHE_PORT);

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, newMeta);
      mockedKeysWithDuplicates(keysApiService, unusedKeys, newMeta);

      // Check if on pause now
      const isOnPauseAfter =
        await routerContract.getStakingModuleIsDepositsPaused(1);
      expect(isOnPauseAfter).toBe(false);
    },
    TESTS_TIMEOUT,
  );

  test(
    'skip deposit if find duplicated key',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const currentBlock = await tempProvider.getBlock('latest');

      // this key should be used in kapi
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
          version: '1',
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      // list of keys for /keys?used=false mock
      const unusedKeys = [
        {
          key: '0xa9bfaa8207ee6c78644c079ffc91b6e5abcc5eede1b7a06abb8fb40e490a75ea269c178dd524b65185299d2bbd2eb7b2',
          depositSignature:
            '0xaa5f2a1053ba7d197495df44d4a32b7ae10265cf9e38560a16b782978c0a24271a113c9538453b7e45f35cb64c7adb460d7a9fe8c8ce6b8c80ca42fd5c48e180c73fc08f7d35ba32e39f32c902fd333faf47611827f0b7813f11c4c518dd2e59',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
        {
          key: '0xa9bfaa8207ee6c78644c079ffc91b6e5abcc5eede1b7a06abb8fb40e490a75ea269c178dd524b65185299d2bbd2eb7b2',
          depositSignature:
            '0xaa5f2a1053ba7d197495df44d4a32b7ae10265cf9e38560a16b782978c0a24271a113c9538453b7e45f35cb64c7adb460d7a9fe8c8ce6b8c80ca42fd5c48e180c73fc08f7d35ba32e39f32c902fd333faf47611827f0b7813f11c4c518dd2e59',
          operatorIndex: 0,
          used: false,
          index: 1,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, meta);

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

      // just skip on this iteration deposit for staking module
      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module
      const unusedKeysWithoutDuplicates = [
        {
          key: '0xa9bfaa8207ee6c78644c079ffc91b6e5abcc5eede1b7a06abb8fb40e490a75ea269c178dd524b65185299d2bbd2eb7b2',
          depositSignature:
            '0xaa5f2a1053ba7d197495df44d4a32b7ae10265cf9e38560a16b782978c0a24271a113c9538453b7e45f35cb64c7adb460d7a9fe8c8ce6b8c80ca42fd5c48e180c73fc08f7d35ba32e39f32c902fd333faf47611827f0b7813f11c4c518dd2e59',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      const newBlock = await tempProvider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        newStakingModule,
        newMeta,
      );

      mockedKeysApiUnusedKeys(
        keysApiService,
        unusedKeysWithoutDuplicates,
        newMeta,
      );

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(1);

      expect(sendDepositMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 9,
          stakingModuleId: 1,
        }),
      );
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
          version: '1',
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      // list of keys for /keys?used=false mock
      const unusedKeys = [
        {
          key: '0xa9bfaa8207ee6c78644c079ffc91b6e5abcc5eede1b7a06abb8fb40e490a75ea269c178dd524b65185299d2bbd2eb7b2',
          depositSignature:
            '0xaa5f2a1053ba7d197495df44d4a32b7ae10265cf9e38560a16b782978c0a24271a113c9538453b7e45f35cb64c7adb460d7a9fe8c8ce6b8c80ca42fd5c48e180c73fc08f7d35ba32e39f32c902fd333faf47611827f0b7813f11c4c518dd2e59',
          operatorIndex: 0,
          used: false,
          index: 0,
          moduleAddress: NOP_REGISTRY,
        },
      ];

      const hashWasChanged =
        '0xd921055dbb407e09f64afe5182a64c1bd309fe28f26909a96425cdb6bfc48959';
      const newMeta = mockedMeta(currentBlock, hashWasChanged);
      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, newMeta);

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);
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

      // this key should be used in kapi
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
          version: '1',
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      // list of keys for /keys?used=false mock
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

      const keys = [...unusedKeys, { ...unusedKeys[0], used: true }];
      mockedKeysApiUnusedKeys(keysApiService, unusedKeys, meta);
      mockedKeysWithDuplicates(keysApiService, keys, meta);

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

      // just skip on this iteration deposit for staking module
      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);

      // after deleting duplicates in staking module,
      // council will resume deposits to module

      const newBlock = await tempProvider.getBlock('latest');
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(currentBlock, newBlock.hash);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        newStakingModule,
        newMeta,
      );

      mockedKeysApiUnusedKeys(keysApiService, [], newMeta);
      mockedKeysWithDuplicates(keysApiService, [], meta);

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(1);

      expect(sendDepositMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          blockNumber: newBlock.number,
          guardianAddress: wallet.address,
          guardianIndex: 9,
          stakingModuleId: 1,
        }),
      );
    },
    TESTS_TIMEOUT,
  );

  test(
    'invalid unused keys',
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
          version: '1',
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(currentBlock, currentBlock.hash);
      const meta = mockedMeta(currentBlock, currentBlock.hash);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      const keyWithWrongSign = {
        key: toHexString(pk),
        // just some random sign
        depositSignature:
          '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
        operatorIndex: 0,
        used: false,
        index: 0,
        moduleAddress: NOP_REGISTRY,
      };
      // list of keys for /keys?used=false mock
      mockedKeysApiUnusedKeys(keysApiService, [keyWithWrongSign], meta);
      mockedKeysWithDuplicates(keysApiService, [], meta);

      await guardianService.handleNewBlock();

      expect(validateKeys).toBeCalledTimes(1);
      expect(validateKeys).toBeCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            key: toHexString(pk),
            // just some random sign
            depositSignature:
              '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
          }),
        ]),
      );

      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);

      await new Promise((res) => setTimeout(res, SLEEP_FOR_RESULT));

      const newBlock = await tempProvider.getBlock('latest');

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: newBlock.number,
          endBlock: newBlock.number,
          version: '1',
        },
      });

      // mocked curated module
      const newMeta = mockedMeta(newBlock, newBlock.hash);
      const newStakingModule = mockedModule(newBlock, newBlock.hash, 6047);

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        newStakingModule,
        newMeta,
      );

      // list of keys for /keys?used=false mock
      mockedKeysApiUnusedKeys(keysApiService, [keyWithWrongSign], newMeta);

      validateKeys.mockClear();

      await guardianService.handleNewBlock();

      expect(validateKeys).toBeCalledTimes(1);
      expect(validateKeys).toBeCalledWith([]);

      // should found invalid key and skip again
      // on this iteration cache will be used
      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );
});
