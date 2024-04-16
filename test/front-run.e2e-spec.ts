import { Test } from '@nestjs/testing';

// Global Helpers
import { ethers } from 'ethers';
import { fromHexString, toHexString } from '@chainsafe/ssz';

// Helpers
import {
  computeRoot,
  mockedDvtOperators,
  mockedKeysApiFind,
  mockedKeysApiGetAllKeys,
  mockedKeysApiOperators,
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
  FAKE_SIMPLE_DVT,
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

import { SecurityModule, SecurityService } from '../src/contracts/security';

import { LidoService } from '../src/contracts/lido';
import { LidoModule } from '../src/contracts/lido';

import { KeysApiService } from '../src/keys-api/keys-api.service';
import { KeysApiModule } from '../src/keys-api/keys-api.module';

import { ProviderService } from '../src/provider';
import { GanacheProviderModule } from '../src/provider';

import { BlsService } from '../src/bls';
import { GuardianMessageService } from '../src/guardian/guardian-message';
import { KeyValidatorInterface } from '@lido-nestjs/key-validation';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

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

  let securityService: SecurityService;

  let stakingModuleGuardService: StakingModuleGuardService;

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
    securityService = moduleRef.get(SecurityService);

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
  });

  // how to make this tests part of tests launch
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

  // эти сценарии должны показать , что в случае попытки фронтрана не происходит пауза но и депозит не происходит
  // но так же в след версии должны показывать, что анветтинг происходит

  // так же анветтинг не происходит, если попытка фронтрана была совершена с неверной сигнатурой (депозит дата невалиданая)
  // так же если фронт ран был выполнен с нашими кредами для вывода депозита

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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
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
          key: '0xb3c90525010a5710d43acbea46047fc37ed55306d032527fa15dd7e8cd8a9a5fa490347cc5fce59936fb8300683cd9f3',
          depositSignature:
            '0x8a77d9411781360cc107344a99f6660b206d2c708ae7fa35565b76ec661a0b86b6c78f5b5691d2cf469c27d0655dfc6311451a9e0501f3c19c6f7e35a770d1a908bfec7cba2e07339dc633b8b6626216ce76ec0fa48ee56aaaf2f9dc7ccb2fe2',
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
          },
        ],
        headers: {
          startBlock: currentBlock.number,
          endBlock: currentBlock.number,
          version: '1',
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
          guardianIndex: 9,
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
      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );
      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);
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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
        meta,
      );

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, meta);

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

      mockedKeysApiOperators(
        keysApiService,
        mockedOperators,
        stakingModule,
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

      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);
      mockedKeysApiFind(keysApiService, unusedKeys, newMeta);

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
      mockedKeysApiGetAllKeys(keysApiService, unusedKeys, newMeta);

      await guardianService.handleNewBlock();

      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);
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
