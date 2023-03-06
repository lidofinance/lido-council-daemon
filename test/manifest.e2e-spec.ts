import { Test } from '@nestjs/testing';

// Global Helpers
import { ethers } from 'ethers';
import { Type, fromHexString, toHexString } from '@chainsafe/ssz';

// Constants
import { CHAINS } from '@lido-sdk/constants';
import { WeiPerEther } from '@ethersproject/constants';

// Ganache
import { makeServer } from './server';

// Contract Factories
import {
  DepositAbi__factory,
  SecurityAbi__factory,
  StakingRouterAbi__factory,
} from './../src/generated';

// BLS helpers
import { SecretKey } from '@chainsafe/blst';
import {
  DOMAIN_DEPOSIT,
  GENESIS_FORK_VERSION_BY_CHAIN_ID,
  ZERO_HASH,
} from './../src/bls/bls.constants';
import {
  DepositMessage,
  DepositData,
  ForkData,
  SigningData,
} from './../src/bls/bls.containers';

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

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

// Node can be without cache and environment in actions is slow, account for that
const TESTS_TIMEOUT = 30000;

// Needs to be higher on gh actions for reliable runs
const SLEEP_FOR_CONFIRMATION = 3000;

// Addresses
const SECURITY_MODULE = '0x48bEdD13FF63F7Cd4d349233B6a57Bff285f8E32';
const SECURITY_MODULE_OWNER = '0xa5F1d7D49F581136Cf6e58B32cBE9a2039C48bA1';
const STAKING_ROUTER = '0xDd7d15490748a803AeC6987046311AF76a5A6502';
const DEPOSIT_CONTRACT = '0x4242424242424242424242424242424242424242';
const NOP_REGISTRY = '0x8a1E2986E52b441058325c315f83C9D4129bDF72';

// Withdrawal credentials
const GOOD_WC =
  '0x0100000000000000000000008c5cba32b36fcbc04e7b15ba9b2fe14057590c6e';
const BAD_WC =
  '0x0100000000000000000000008c5cba32b36fcbc04e7b15ba9b2fe14057590c7e';

// Fork node config
const CHAIN_ID = CHAINS.Zhejiang;
const FORK_BLOCK = 128976;
const UNLOCKED_ACCOUNTS = [SECURITY_MODULE_OWNER];
const GANACHE_PORT = 8545;

// BLS key for the validator
const BLS_PRIV_KEY =
  '1c6f88347d1286690c42ad2886b6b782d4884e00eabed174696de345696cfa65';
const sk = SecretKey.fromBytes(fromHexString(BLS_PRIV_KEY));
const pk = sk.toPublicKey().toBytes();

const computeDomain = (
  domainType: Uint8Array,
  forkVersion: Uint8Array,
  genesisValidatorRoot: Uint8Array,
): Uint8Array => {
  const forkDataRoot = computeForkDataRoot(forkVersion, genesisValidatorRoot);

  const domain = new Uint8Array(32);
  domain.set(domainType, 0);
  domain.set(forkDataRoot.slice(0, 28), 4);
  return domain;
};

const computeForkDataRoot = (
  currentVersion: Uint8Array,
  genesisValidatorsRoot: Uint8Array,
): Uint8Array => {
  return ForkData.hashTreeRoot({ currentVersion, genesisValidatorsRoot });
};

const computeSigningRoot = <T>(
  type: Type<T>,
  sszObject: T,
  domain: Uint8Array,
): Uint8Array => {
  const objectRoot = type.hashTreeRoot(sszObject);
  return SigningData.hashTreeRoot({ objectRoot, domain });
};

const computeRoot = (depositMessage: {
  pubkey: Uint8Array;
  withdrawalCredentials: Uint8Array;
  amount: number;
}) => {
  const forkVersion = GENESIS_FORK_VERSION_BY_CHAIN_ID[CHAIN_ID];

  const domain = computeDomain(DOMAIN_DEPOSIT, forkVersion, ZERO_HASH);

  const signingRoot = computeSigningRoot(
    DepositMessage,
    depositMessage,
    domain,
  );

  return signingRoot;
};

const mockKeysApi = (
  sig: Uint8Array,
  block: ethers.providers.Block,
  keysApiService: KeysApiService,
) => {
  const mockedModule = {
    nonce: 6046,
    type: 'grouped-onchain-v1',
    id: 1,
    stakingModuleAddress: NOP_REGISTRY,
    moduleFee: 10,
    treasuryFee: 10,
    targetShare: 10,
    status: 1,
    name: 'NodeOperatorRegistry',
    lastDepositAt: block.timestamp,
    lastDepositBlock: block.number,
  };

  const mockedMeta = {
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: block.timestamp,
  };

  const mockedKey = {
    key: toHexString(pk),
    depositSignature: toHexString(sig),
    operatorIndex: 0,
    used: false,
    index: 0,
  };

  jest.spyOn(keysApiService, 'getModulesList').mockImplementation(async () => ({
    data: [mockedModule],
    elBlockSnapshot: mockedMeta,
  }));

  jest
    .spyOn(keysApiService, 'getUnusedModuleKeys')
    .mockImplementation(async () => ({
      data: {
        keys: [mockedKey],
        module: mockedModule,
      },
      meta: {
        elBlockSnapshot: mockedMeta,
      },
    }));
};

describe('ganache e2e tests', () => {
  let providerService: ProviderService;
  let walletService: WalletService;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let lidoService: LidoService;
  let depositService: DepositService;
  let blsService: BlsService;
  let server: ReturnType<typeof makeServer>;

  beforeEach(async () => {
    server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
    await server.listen(GANACHE_PORT);
  });

  afterEach(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Prepare a signer for the unlocked Ganache account
    if (!process.env.WALLET_PRIVATE_KEY) {
      throw new Error(
        'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.',
      );
    }
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

    // Initialising needed service instead of the whole app
    blsService = moduleRef.get(BlsService);
    await blsService.onModuleInit();

    jest
      .spyOn(lidoService, 'getWithdrawalCredentials')
      .mockImplementation(async () => GOOD_WC);
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

      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

      mockKeysApi(goodSig, currentBlock, keysApiService);

      await depositService.setCachedEvents({
        events: [
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
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
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
      const badDepositRoot = DepositData.hashTreeRoot(badDepositData);

      if (!process.env.WALLET_PRIVATE_KEY) {
        throw new Error(
          'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.',
        );
      }
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
        badDepositRoot,
        { value: ethers.constants.WeiPerEther.mul(1) },
      );

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      mockKeysApi(goodSig, newBlock, keysApiService);

      // Pause deposits
      await guardianService.handleNewBlock();

      // Wait for confirmation
      await new Promise((res) => setTimeout(res, SLEEP_FOR_CONFIRMATION));

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

      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

      mockKeysApi(goodSig, currentBlock, keysApiService);

      await depositService.setCachedEvents({
        events: [],
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
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
      const badDepositRoot = DepositData.hashTreeRoot(badDepositData);

      if (!process.env.WALLET_PRIVATE_KEY) {
        throw new Error(
          'Private key is not set. Please provide WALLET_PRIVATE_KEY as an env variable.',
        );
      }
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
        badDepositRoot,
        { value: ethers.constants.WeiPerEther.mul(1) },
      );

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      mockKeysApi(goodSig, newBlock, keysApiService);

      // Pause deposits
      await guardianService.handleNewBlock();

      // Wait for confirmation
      await new Promise((res) => setTimeout(res, SLEEP_FOR_CONFIRMATION));

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

      mockKeysApi(goodSig, currentBlock, keysApiService);

      await depositService.setCachedEvents({
        events: [],
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
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
      const badDepositRoot = DepositData.hashTreeRoot(badDepositData);

      if (!process.env.WALLET_PRIVATE_KEY) {
        process.exit();
      }
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
        badDepositRoot,
        { value: ethers.constants.WeiPerEther.mul(1) },
      );

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      mockKeysApi(goodSig, newBlock, keysApiService);

      // Pause deposits
      await guardianService.handleNewBlock();

      // Wait for confirmation
      await new Promise((res) => setTimeout(res, SLEEP_FOR_CONFIRMATION));

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

      const goodDepositMessage = {
        pubkey: pk,
        withdrawalCredentials: fromHexString(GOOD_WC),
        amount: 32000000000, // gwei!
      };
      const goodSigningRoot = computeRoot(goodDepositMessage);
      const goodSig = sk.sign(goodSigningRoot).toBytes();

      mockKeysApi(goodSig, currentBlock, keysApiService);

      const goodDepositData = {
        ...goodDepositMessage,
        signature: goodSig,
      };
      const goodDepositRoot = DepositData.hashTreeRoot(goodDepositData);

      await depositService.setCachedEvents({
        events: [],
        startBlock: currentBlock.number,
        endBlock: currentBlock.number,
      });

      // Check if the service is ok and ready to go
      await guardianService.handleNewBlock();

      if (!process.env.WALLET_PRIVATE_KEY) {
        process.exit();
      }
      const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY);

      // Make a bad deposit
      const signer = wallet.connect(providerService.provider);
      const depositContract = DepositAbi__factory.connect(
        DEPOSIT_CONTRACT,
        signer,
      );
      await depositContract.deposit(
        goodDepositData.pubkey,
        goodDepositData.withdrawalCredentials,
        goodDepositData.signature,
        goodDepositRoot,
        { value: ethers.constants.WeiPerEther.mul(32) },
      );

      // Mock Keys API again on new block
      const newBlock = await providerService.provider.getBlock('latest');
      mockKeysApi(goodSig, newBlock, keysApiService);

      // Pause deposits
      await guardianService.handleNewBlock();

      // Wait for confirmation
      await new Promise((res) => setTimeout(res, SLEEP_FOR_CONFIRMATION));

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
});
