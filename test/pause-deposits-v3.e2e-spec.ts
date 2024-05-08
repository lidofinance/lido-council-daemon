import { Test } from '@nestjs/testing';
import { BAD_WC, NO_PRIVKEY_MESSAGE } from './constants';
import { AnvilFork } from './helpers/anvil-fork';
import * as dotenv from 'dotenv';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { LoggerModule } from 'common/logger';
import { GuardianModule, GuardianService } from 'guardian';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { WalletModule } from 'wallet';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { LidoModule } from 'contracts/lido';
import { DepositModule, DepositService } from 'contracts/deposit';
import { SecurityModule, SecurityService } from 'contracts/security';
import { AnvilProviderModule } from 'provider/provider.anvil';
import { providers } from 'ethers';
import { fromHexString, toHexString } from '@chainsafe/ssz';

import {
  computeRoot,
  mockedKeysApiFind,
  mockedKeysApiGetAllKeys,
  mockedKeysApiOperators,
  mockedMeta,
  mockedModule,
  mockedOperators,
} from './helpers';

import { GOOD_WC, sk, pk, NOP_REGISTRY } from './constants';
import { KeysApiService } from 'keys-api/keys-api.service';
import { GuardianMessageService } from 'guardian/guardian-message';
import {
  SECURITY_CONTRACT_OWNER,
  initializeContractsV3,
} from './helpers/contract-utils-v3';
import { SecurityAbi__factory } from 'generated';

const FORK_BLOCK_MAINNET = 19803626;

dotenv.config();

describe('Test pause for security contract of version 3', () => {
  let guardianService: GuardianService;
  let keysApiService: KeysApiService;
  let repositoryService: RepositoryService;
  let depositService: DepositService;
  let guardianMessageService: GuardianMessageService;
  let securityService: SecurityService;

  let sendPauseMessage: jest.SpyInstance;
  let dsm_address = '';
  let locator_address = '';
  const ORIGINAL_LOCATOR_DEVNET_ADDRESS = process.env.LOCATOR_DEVNET_ADDRESS;

  beforeAll(async () => {
    const forkUrl = process.env.RPC_URL;
    const anvilPath = process.env.ANVIL_PATH;

    if (!forkUrl || !anvilPath) {
      console.error('For running tests set RPC_URL and ANVIL_PATH variables');
      return;
    }

    const server = new AnvilFork(
      anvilPath,
      forkUrl,
      FORK_BLOCK_MAINNET,
      '8546',
    );
    server.start();

    // Initialize contracts using the refactored utility functions
    const security_abi_path = './test/fixtures/security.abi.json';
    const locator_abi_path = './src/abi/locator.abi.json';
    const { dsm_address: dsmAddr, locator_address: locatorAddr } =
      await initializeContractsV3(
        'http://127.0.0.1:8546',
        security_abi_path,
        locator_abi_path,
      );
    dsm_address = dsmAddr;
    locator_address = locatorAddr;

    if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);
    process.env.LOCATOR_DEVNET_ADDRESS = locator_address;

    const moduleRef = await Test.createTestingModule({
      imports: [
        AnvilProviderModule.forRoot(),
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

    guardianService = moduleRef.get(GuardianService);
    keysApiService = moduleRef.get(KeysApiService);
    repositoryService = moduleRef.get(RepositoryService);
    depositService = moduleRef.get(DepositService);
    guardianMessageService = moduleRef.get(GuardianMessageService);
    securityService = moduleRef.get(SecurityService);

    jest
      .spyOn(repositoryService, 'getDepositAddress')
      .mockImplementation(
        async () => '0x00000000219ab540356cBB839Cbe05303d7705Fa',
      );
    sendPauseMessage = jest
      .spyOn(guardianMessageService, 'sendPauseMessage')
      .mockImplementation(() => Promise.resolve());

    jest
      .spyOn(guardianMessageService, 'pingMessageBroker')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(securityService, 'getGuardianIndex')
      .mockImplementation(() => Promise.resolve(1));
  }, 60000);

  afterAll(() => {
    process.env.LOCATOR_DEVNET_ADDRESS = ORIGINAL_LOCATOR_DEVNET_ADDRESS;
  });

  test('historical front-run', async () => {
    const provider = new providers.JsonRpcProvider('http://127.0.0.1:8546');
    const currentBlock = await provider.getBlock('latest');
    const forkBlock = await provider.getBlock(FORK_BLOCK_MAINNET);

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
        used: true,
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

    mockedKeysApiGetAllKeys(keysApiService, keys, meta);
    mockedKeysApiFind(keysApiService, keys, meta);

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
        },
      ],
      headers: {
        startBlock: forkBlock.number,
        endBlock: forkBlock.number,
        version: '1',
      },
    });

    await guardianService.handleNewBlock();

    await new Promise((res) => setTimeout(res, 30000));

    expect(sendPauseMessage).toBeCalledTimes(1);

    const paused = await SecurityAbi__factory.connect(
      dsm_address,
      provider.getSigner(SECURITY_CONTRACT_OWNER),
    ).isDepositsPaused();

    expect(paused).toEqual(true);
  }, 40000);
});
