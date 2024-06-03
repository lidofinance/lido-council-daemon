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

// Mock rabbit straight away
jest.mock('../src/transport/stomp/stomp.client.ts');

jest.setTimeout(10_000);

import { setupTestingModule, closeServer } from './helpers/test-setup';

describe('ganache e2e tests', () => {
  let server;
  let providerService;
  let walletService;
  let keysApiService;
  let guardianService;
  let depositService;
  let securityService;
  let stakingModuleGuardService;
  let sendDepositMessage;
  let sendPauseMessage;
  let validateKeys;
  let levelDBService;

  beforeEach(async () => {
    ({
      server,
      providerService,
      walletService,
      keysApiService,
      guardianService,
      depositService,
      securityService,
      stakingModuleGuardService,
      sendDepositMessage,
      sendPauseMessage,
      validateKeys,
      levelDBService,
    } = await setupTestingModule());
  });

  afterEach(async () => {
    await closeServer(server, levelDBService);
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
    'should use cache',
    async () => {
      const tempProvider = new ethers.providers.JsonRpcProvider(
        `http://127.0.0.1:${GANACHE_PORT}`,
      );
      const block0 = await tempProvider.getBlock('latest');

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
          startBlock: block0.number,
          endBlock: block0.number,
          version: '1',
        },
      });

      // mocked curated module
      const stakingModule = mockedModule(block0, block0.hash);
      const meta = mockedMeta(block0, block0.hash);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: stakingModule }],
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
      mockedKeysApiGetAllKeys(keysApiService, [keyWithWrongSign], meta);
      mockedKeysApiFind(keysApiService, [], meta);

      expect(
        stakingModuleGuardService['lastContractsStateByModuleId'][
          stakingModule.id
        ],
      ).not.toBeDefined();

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

      // TEST: If lastChangeBlockHash was not changed, validation will not be called
      const block1 = await tempProvider.getBlock('latest');

      await depositService.setCachedEvents({
        data: [],
        headers: {
          startBlock: block1.number,
          endBlock: block1.number,
          version: '1',
        },
      });

      // mocked curated module
      // lastChangeBlockHash will not change
      const meta1 = mockedMeta(block1, block0.hash);
      const stakingModule1 = mockedModule(block1, block0.hash, 6047);

      mockedKeysApiOperatorsMany(
        keysApiService,
        [{ operators: mockedOperators, module: stakingModule1 }],
        meta1,
      );

      // list of keys for /keys?used=false mock
      mockedKeysApiGetAllKeys(keysApiService, [keyWithWrongSign], meta1);

      validateKeys.mockClear();

      await guardianService.handleNewBlock();

      expect(validateKeys).toBeCalledTimes(1);
      expect(validateKeys).toBeCalledWith([]);
      expect(sendDepositMessage).toBeCalledTimes(0);
      expect(sendPauseMessage).toBeCalledTimes(0);
    },
    TESTS_TIMEOUT,
  );

  test('should validate again if signature was changed', async () => {
    const tempProvider = new ethers.providers.JsonRpcProvider(
      `http://127.0.0.1:${GANACHE_PORT}`,
    );
    const block0 = await tempProvider.getBlock('latest');

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
        startBlock: block0.number,
        endBlock: block0.number,
        version: '1',
      },
    });

    // mocked curated module
    const stakingModule = mockedModule(block0, block0.hash);
    const meta = mockedMeta(block0, block0.hash);

    mockedKeysApiOperatorsMany(
      keysApiService,
      [{ operators: mockedOperators, module: stakingModule }],
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
    mockedKeysApiGetAllKeys(keysApiService, [keyWithWrongSign], meta);
    mockedKeysApiFind(keysApiService, [], meta);

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

    const block1 = await tempProvider.getBlock('latest');

    await depositService.setCachedEvents({
      data: [],
      headers: {
        startBlock: block1.number,
        endBlock: block1.number,
        version: '1',
      },
    });

    // mocked curated module
    // lastChangeBlockHash will not change
    const meta1 = mockedMeta(block1, block1.hash);
    const stakingModule1 = mockedModule(block1, block1.hash, 6047);

    const fixedKey = {
      ...keyWithWrongSign,
      depositSignature: toHexString(goodSig),
    };

    // list of keys for /keys?used=false mock
    mockedKeysApiGetAllKeys(keysApiService, [fixedKey], meta1);

    mockedKeysApiOperatorsMany(
      keysApiService,
      [{ operators: mockedOperators, module: stakingModule1 }],
      meta1,
    );

    validateKeys.mockClear();

    await guardianService.handleNewBlock();

    expect(validateKeys).toBeCalledTimes(1);
    expect(validateKeys).toBeCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: toHexString(pk),
          depositSignature: toHexString(goodSig),
        }),
      ]),
    );

    expect(sendDepositMessage).toBeCalledTimes(1);
    expect(sendDepositMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        blockNumber: block1.number,
        guardianAddress: wallet.address,
        guardianIndex: 6,
        stakingModuleId: 1,
      }),
    );

    expect(sendPauseMessage).toBeCalledTimes(0);
  });

  test('should not skip deposits if invalid keys where found in another module', async () => {
    const tempProvider = new ethers.providers.JsonRpcProvider(
      `http://127.0.0.1:${GANACHE_PORT}`,
    );
    const block0 = await tempProvider.getBlock('latest');

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
        startBlock: block0.number,
        endBlock: block0.number,
        version: '1',
      },
    });

    // mocked curated module
    const stakingModule = mockedModule(block0, block0.hash);
    const stakingDvtModule = mockedModuleDvt(block0, block0.hash);
    const meta = mockedMeta(block0, block0.hash);

    mockedKeysApiOperatorsMany(
      keysApiService,
      [
        { operators: mockedOperators, module: stakingModule },
        { operators: mockedDvtOperators, module: stakingDvtModule },
      ],
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
    const dvtKey = {
      key: '0xa4d381739a4cc9554bf01c49e827a22ae99d429a79bd74ecfa86b72210c151644e511ce1c5fa4e5fb8d355dec35239e2',
      depositSignature:
        '0xac50577d80539bf0a9ac0ea98d7a98e4bb3c644c28d53c57204c297081cbef7ca47975a2fffc05b873b406e3f08b4b6902e57c61b0d98dc7eac49d677c82a5c4f695232158360c7595c4414f5f27c9a7ab1bbdbafa4f85c967f82a4f68cb6f5e',
      operatorIndex: 0,
      used: false,
      index: 0,
      moduleAddress: FAKE_SIMPLE_DVT,
    };
    // list of keys for /keys?used=false mock
    mockedKeysApiGetAllKeys(keysApiService, [keyWithWrongSign, dvtKey], meta);
    mockedKeysApiFind(keysApiService, [], meta);

    expect(
      stakingModuleGuardService['lastContractsStateByModuleId'][
        stakingModule.id
      ],
    ).not.toBeDefined();

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

    sendDepositMessage.mockReset();

    await guardianService.handleNewBlock();

    expect(validateKeys).toBeCalledTimes(2);
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
    expect(validateKeys).toBeCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: dvtKey.key,
          depositSignature: dvtKey.depositSignature,
        }),
      ]),
    );

    expect(sendDepositMessage).toBeCalledTimes(1);
    expect(sendPauseMessage).toBeCalledTimes(0);
  });

  // TODO: add test on change of wc
});