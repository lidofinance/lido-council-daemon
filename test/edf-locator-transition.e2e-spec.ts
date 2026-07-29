import { LoggerService } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { ConfigModule, Configuration } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { Signature } from '@ethersproject/bytes';
import { ContractFactory, Wallet, utils } from 'ethers';
import {
  DelegationContractAbi__factory,
  LocatorAbi__factory,
  OssifiableProxyAbi__factory,
  SecurityAbi__factory,
  SecurityV5Abi__factory,
  StakingRouterAbi__factory,
} from 'generated';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import {
  GuardianExecutionContext,
  SecurityModule,
  SecurityService,
} from 'contracts/security';
import {
  DELEGATE_PRIVATE_KEYS,
  WALLET_PRIVATE_KEY,
  WalletService,
} from 'wallet';
import { TestProviderModule } from 'provider';
import {
  GuardianMessageModule,
  GuardianMessageService,
} from 'guardian/guardian-message';
import { MessageType } from 'messages';
import { DataBusClient } from 'contracts/data-bus/data-bus.client';
import * as dataBusFixture from './fixtures/contracts/data-bus.bytecode.json';
import { HardhatServer } from './helpers/hardhat-server';
import {
  deployEdfUpgradeOnFork,
  LOCATOR_CONFIG_KEYS,
  readLocatorConfig,
} from './helpers/edf-fork';
import { CHAIN_ID } from './helpers/config';
import {
  accountImpersonate,
  setBalance,
  testSetupProvider,
} from './helpers/provider';
import { getLocator } from './helpers/sr.contract';
import { TEST_SERVER_URL } from './constants';

jest.setTimeout(180_000);

const DEPOSIT_ROOT = utils.hexZeroPad('0x11', 32);
const STAKING_MODULE_ID = 1;
const NONCE = 7;
const OPERATOR_IDS = '0x0000000000000001';
const VETTED_KEYS_BY_OPERATOR = '0x00000000000000000000000000000002';
const ERC1271_MAGIC_VALUE = '0x1626ba7e';
const ERC1271_INVALID_VALUE = '0xffffffff';
const DATA_BUS_EVENT_NAMES = [
  'MessageDepositV1',
  'MessagePauseV3',
  'MessageUnvetV1',
  'MessagePingV1',
];

interface SignedMessages {
  deposit: { digest: string; signature: Signature };
  pause: { digest: string; signature: Signature };
  unvet: { digest: string; signature: Signature };
}

async function ensureLegacyGuardian(
  dsmAddress: string,
  guardianAddress: string,
): Promise<void> {
  const dsm = SecurityAbi__factory.connect(dsmAddress, testSetupProvider);
  const guardians = await dsm.getGuardians();
  if (
    guardians.some(
      (guardian) =>
        utils.getAddress(guardian) === utils.getAddress(guardianAddress),
    )
  ) {
    return;
  }

  const owner = await dsm.getOwner();
  await accountImpersonate(owner);
  await setBalance(owner, 10);
  await (
    await dsm
      .connect(testSetupProvider.getSigner(owner))
      .addGuardian(guardianAddress, 1)
  ).wait();
}

async function ensureDepositsUnpaused(dsmAddress: string): Promise<void> {
  const dsm = SecurityAbi__factory.connect(dsmAddress, testSetupProvider);
  if (!(await dsm.isDepositsPaused())) {
    return;
  }

  const owner = await dsm.getOwner();
  await accountImpersonate(owner);
  await setBalance(owner, 10);
  await (
    await dsm.connect(testSetupProvider.getSigner(owner)).unpauseDeposits()
  ).wait();

  expect(await dsm.isDepositsPaused()).toBe(false);
}

async function signAllMessages(
  securityService: SecurityService,
  walletService: WalletService,
  context: GuardianExecutionContext,
  blockNumber: number,
  blockHash: string,
): Promise<SignedMessages> {
  const digests: string[] = [];
  const signMessage = walletService.signMessage.bind(walletService);
  const signMessageSpy = jest
    .spyOn(walletService, 'signMessage')
    .mockImplementation((digest) => {
      digests.push(digest);
      return signMessage(digest);
    });

  try {
    const depositSignature = await securityService.signDepositData(
      DEPOSIT_ROOT,
      NONCE,
      blockNumber,
      blockHash,
      STAKING_MODULE_ID,
      context,
    );
    const pauseSignature = await securityService.signPauseDataV3(
      blockNumber,
      blockHash,
      context,
    );
    const unvetSignature = await securityService.signUnvetData(
      NONCE,
      blockNumber,
      blockHash,
      STAKING_MODULE_ID,
      OPERATOR_IDS,
      VETTED_KEYS_BY_OPERATOR,
      context,
    );

    expect(digests).toHaveLength(3);
    return {
      deposit: { digest: digests[0], signature: depositSignature },
      pause: { digest: digests[1], signature: pauseSignature },
      unvet: { digest: digests[2], signature: unvetSignature },
    };
  } finally {
    signMessageSpy.mockRestore();
  }
}

async function pauseDepositsAndExpectOnChain(
  securityService: SecurityService,
  context: GuardianExecutionContext,
  blockNumber: number,
  signature: Signature,
  expectedSender: string,
): Promise<void> {
  const dsm = SecurityAbi__factory.connect(
    context.dsmAddress,
    testSetupProvider,
  );
  expect(await dsm.isDepositsPaused()).toBe(false);

  const receipt = await securityService.pauseDepositsV3(
    blockNumber,
    signature,
    context,
  );

  expect(receipt.status).toBe(1);
  expect(receipt.from).toBe(expectedSender);
  expect(await dsm.isDepositsPaused()).toBe(true);
}

async function publishAllMessagesAndExpectSender(
  guardianMessageService: GuardianMessageService,
  dataBusClient: DataBusClient,
  context: GuardianExecutionContext,
  blockNumber: number,
  blockHash: string,
  messages: SignedMessages,
  expectedSender: string,
): Promise<void> {
  const fromBlock = (await testSetupProvider.getBlockNumber()) + 1;

  await guardianMessageService.sendDepositMessage({
    depositRoot: DEPOSIT_ROOT,
    nonce: NONCE,
    blockNumber,
    blockHash,
    guardianAddress: context.guardianAddress,
    guardianIndex: context.guardianIndex,
    signature: messages.deposit.signature,
    stakingModuleId: STAKING_MODULE_ID,
  });
  await guardianMessageService.sendPauseMessageV3({
    blockNumber,
    blockHash,
    guardianAddress: context.guardianAddress,
    guardianIndex: context.guardianIndex,
    signature: messages.pause.signature,
  });
  await guardianMessageService.sendUnvetMessage({
    nonce: NONCE,
    blockNumber,
    blockHash,
    guardianAddress: context.guardianAddress,
    guardianIndex: context.guardianIndex,
    stakingModuleId: STAKING_MODULE_ID,
    operatorIds: OPERATOR_IDS,
    vettedKeysByOperator: VETTED_KEYS_BY_OPERATOR,
    signature: messages.unvet.signature,
  });
  await guardianMessageService.sendMessageFromGuardian({
    type: MessageType.PING,
    blockNumber,
    guardianAddress: context.guardianAddress,
    guardianIndex: context.guardianIndex,
    stakingModuleIds: [STAKING_MODULE_ID],
  });

  const events = await dataBusClient.getAll(fromBlock);
  expect(events.map(({ name }) => name)).toEqual(DATA_BUS_EVENT_NAMES);
  expect(
    events.map(({ guardianAddress }) => utils.getAddress(guardianAddress)),
  ).toEqual(DATA_BUS_EVENT_NAMES.map(() => expectedSender));
}

function expectRecoveredSigner(
  messages: SignedMessages,
  expectedSigner: string,
): void {
  for (const message of Object.values(messages)) {
    expect(utils.recoverAddress(message.digest, message.signature)).toBe(
      expectedSigner,
    );
  }
}

async function expectValidErc1271Signatures(
  delegationContract: ReturnType<typeof DelegationContractAbi__factory.connect>,
  messages: SignedMessages,
): Promise<void> {
  for (const message of Object.values(messages)) {
    expect(
      await delegationContract.isValidSignature(
        message.digest,
        utils.joinSignature(message.signature),
      ),
    ).toBe(ERC1271_MAGIC_VALUE);
  }
}

async function expectInvalidErc1271Signatures(
  delegationContract: ReturnType<typeof DelegationContractAbi__factory.connect>,
  messages: SignedMessages,
): Promise<void> {
  for (const message of Object.values(messages)) {
    expect(
      await delegationContract.isValidSignature(
        message.digest,
        utils.joinSignature(message.signature),
      ),
    ).toBe(ERC1271_INVALID_VALUE);
  }
}

describe('EDF Locator transition on a Hoodi fork', () => {
  let hardhatServer: HardhatServer;
  let snapshotId: string;

  beforeAll(async () => {
    if (!process.env.RPC_URL) {
      throw new Error('RPC_URL is required to run the EDF fork transition');
    }

    hardhatServer = new HardhatServer();
    await hardhatServer.start();
  });

  beforeEach(async () => {
    snapshotId = await testSetupProvider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await testSetupProvider.send('evm_revert', [snapshotId]);
  });

  afterAll(async () => {
    await hardhatServer?.stop();
  });

  it('updates the Locator and daemon DSM cache after the EDF contracts are deployed', async () => {
    const locatorAddress = getLocator().address;
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as LoggerService;
    const provider = new SimpleFallbackJsonRpcBatchProvider(
      {
        urls: [TEST_SERVER_URL],
        network: CHAIN_ID,
        maxRetries: 1,
        logRetries: false,
        logSuccessfulAttempts: false,
      },
      logger,
    );
    const locatorService = new LocatorService(provider, {
      LOCATOR_DEVNET_ADDRESS: locatorAddress,
    } as Configuration);
    const repository = new RepositoryService(logger, provider, locatorService);

    const blockBefore = await testSetupProvider.getBlock('latest');
    await repository.initCachedContracts({ blockHash: blockBefore.hash });
    const cachedDsmBefore = repository.getCachedDSMContract().address;

    const deployment = await deployEdfUpgradeOnFork(locatorAddress);
    const stakingRouter = StakingRouterAbi__factory.connect(
      deployment.locatorConfigBefore.stakingRouter,
      testSetupProvider,
    );
    const unvettingRole = await stakingRouter.STAKING_MODULE_UNVETTING_ROLE();
    const securityService = new SecurityService(
      { inc: jest.fn() } as any,
      { inc: jest.fn() } as any,
      logger,
      provider,
      repository,
      {
        address: deployment.delegateAddress,
        wallet: { connect: () => provider },
        selectLegacyWallet: jest.fn(),
        selectDelegateWallet: jest.fn(),
      } as any,
      {
        DELEGATION_CONTRACT_ADDRESS: deployment.delegationContractAddress,
      } as Configuration,
    );
    const contextBefore = await securityService.getGuardianExecutionContext({
      blockHash: blockBefore.hash,
    });

    expect(cachedDsmBefore).toBe(deployment.previousDsmAddress);
    expect(deployment.dsmAddress).not.toBe(deployment.previousDsmAddress);
    expect(deployment.locatorImplementationAddress).not.toBe(
      deployment.previousLocatorImplementation,
    );
    expect(
      await stakingRouter.hasRole(unvettingRole, deployment.previousDsmAddress),
    ).toBe(true);
    expect(
      await stakingRouter.hasRole(unvettingRole, deployment.dsmAddress),
    ).toBe(false);
    expect(contextBefore).toEqual(
      expect.objectContaining({
        dsmAddress: deployment.previousDsmAddress,
        mode: 'legacy-eoa',
        guardianAddress: deployment.delegateAddress,
        delegateAddress: deployment.delegateAddress,
      }),
    );

    const receipt = await deployment.activate();
    const blockAfter = await testSetupProvider.getBlock(receipt.blockNumber);
    await repository.initCachedContracts({ blockHash: blockAfter.hash });

    const locator = LocatorAbi__factory.connect(
      locatorAddress,
      testSetupProvider,
    );
    const proxy = OssifiableProxyAbi__factory.connect(
      locatorAddress,
      testSetupProvider,
    );
    const dsm = SecurityV5Abi__factory.connect(
      deployment.dsmAddress,
      testSetupProvider,
    );
    const delegationContract = DelegationContractAbi__factory.connect(
      deployment.delegationContractAddress,
      testSetupProvider,
    );
    const locatorConfigAfter = await readLocatorConfig(locator);
    const contextAfter = await securityService.getGuardianExecutionContext({
      blockHash: blockAfter.hash,
    });

    expect(await proxy.proxy__getImplementation()).toBe(
      deployment.locatorImplementationAddress,
    );
    expect((await dsm.VERSION()).toNumber()).toBe(5);
    expect(await dsm.isGuardian(deployment.delegationContractAddress)).toBe(
      true,
    );
    expect(await delegationContract.getDelegate()).toBe(
      deployment.delegateAddress,
    );
    expect(
      await stakingRouter.hasRole(unvettingRole, deployment.previousDsmAddress),
    ).toBe(false);
    expect(
      await stakingRouter.hasRole(unvettingRole, deployment.dsmAddress),
    ).toBe(true);
    expect(repository.getCachedDSMContract().address).toBe(
      deployment.dsmAddress,
    );
    expect(contextAfter).toEqual({
      dsmAddress: deployment.dsmAddress,
      dsmVersion: 5,
      delegateAddress: deployment.delegateAddress,
      guardianAddress: deployment.delegationContractAddress,
      guardianIndex: 0,
      mode: 'edf',
    });

    for (const key of LOCATOR_CONFIG_KEYS) {
      const expectedAddress =
        key === 'depositSecurityModule'
          ? deployment.dsmAddress
          : deployment.locatorConfigBefore[key];
      expect(locatorConfigAfter[key]).toBe(expectedAddress);
    }
  });

  it('publishes every message type with the active wallet across v4 enact and delegate rotation', async () => {
    const locatorAddress = getLocator().address;
    const legacyWallet = new Wallet(process.env.WALLET_PRIVATE_KEY as string);
    const firstDelegate = Wallet.createRandom();
    const secondDelegate = Wallet.createRandom();
    await setBalance(legacyWallet.address, 100);
    await setBalance(firstDelegate.address, 100);
    await setBalance(secondDelegate.address, 100);

    const deployment = await deployEdfUpgradeOnFork(
      locatorAddress,
      firstDelegate.connect(testSetupProvider),
    );
    await ensureLegacyGuardian(
      deployment.previousDsmAddress,
      legacyWallet.address,
    );
    await ensureDepositsUnpaused(deployment.previousDsmAddress);

    const dataBus = await new ContractFactory(
      ['function sendMessage(bytes32 _eventId, bytes _data)'],
      dataBusFixture.bytecode,
      testSetupProvider.getSigner(0),
    ).deploy();
    await dataBus.deployed();

    process.env.PUBSUB_SERVICE = 'evm-chain';
    process.env.EVM_CHAIN_DATA_BUS_ADDRESS = dataBus.address;
    process.env.EVM_CHAIN_DATA_BUS_PROVIDER_URL = TEST_SERVER_URL;
    process.env.EVM_CHAIN_DATA_BUS_CHAIN_ID = String(CHAIN_ID);

    let moduleRef: TestingModule | undefined;
    try {
      moduleRef = await Test.createTestingModule({
        imports: [
          TestProviderModule.forRoot(),
          ConfigModule.forRoot(),
          PrometheusModule,
          LoggerModule,
          RepositoryModule,
          SecurityModule,
          GuardianMessageModule,
        ],
      })
        .overrideProvider(WALLET_PRIVATE_KEY)
        .useValue(legacyWallet.privateKey)
        .overrideProvider(DELEGATE_PRIVATE_KEYS)
        .useValue([firstDelegate.privateKey, secondDelegate.privateKey])
        .compile();

      const config = moduleRef.get(Configuration);
      config.LOCATOR_DEVNET_ADDRESS = locatorAddress;
      config.DELEGATION_CONTRACT_ADDRESS = deployment.delegationContractAddress;

      const repository = moduleRef.get(RepositoryService);
      const securityService = moduleRef.get(SecurityService);
      const walletService = moduleRef.get(WalletService);
      const guardianMessageService = moduleRef.get(GuardianMessageService);
      const dataBusClient = new DataBusClient(
        dataBus.address,
        legacyWallet.connect(testSetupProvider),
      );

      const blockBefore = await testSetupProvider.getBlock('latest');
      await repository.initCachedContracts({ blockHash: blockBefore.hash });
      const contextBefore = await securityService.getGuardianExecutionContext({
        blockHash: blockBefore.hash,
      });

      expect(contextBefore).toEqual(
        expect.objectContaining({
          dsmVersion: 4,
          mode: 'legacy-eoa',
          delegateAddress: legacyWallet.address,
          guardianAddress: legacyWallet.address,
        }),
      );

      const legacyMessages = await signAllMessages(
        securityService,
        walletService,
        contextBefore,
        blockBefore.number,
        blockBefore.hash,
      );
      expectRecoveredSigner(legacyMessages, legacyWallet.address);
      await publishAllMessagesAndExpectSender(
        guardianMessageService,
        dataBusClient,
        contextBefore,
        blockBefore.number,
        blockBefore.hash,
        legacyMessages,
        legacyWallet.address,
      );
      await pauseDepositsAndExpectOnChain(
        securityService,
        contextBefore,
        blockBefore.number,
        legacyMessages.pause.signature,
        legacyWallet.address,
      );

      const enactReceipt = await deployment.activate();
      const blockAfterEnact = await testSetupProvider.getBlock(
        enactReceipt.blockNumber,
      );
      await repository.initCachedContracts({
        blockHash: blockAfterEnact.hash,
      });
      const firstDelegateContext =
        await securityService.getGuardianExecutionContext({
          blockHash: blockAfterEnact.hash,
        });
      const delegationContract = DelegationContractAbi__factory.connect(
        deployment.delegationContractAddress,
        testSetupProvider,
      );

      expect(firstDelegateContext).toEqual(
        expect.objectContaining({
          dsmVersion: 5,
          mode: 'edf',
          delegateAddress: firstDelegate.address,
          guardianAddress: deployment.delegationContractAddress,
        }),
      );

      const firstDelegateMessages = await signAllMessages(
        securityService,
        walletService,
        firstDelegateContext,
        blockAfterEnact.number,
        blockAfterEnact.hash,
      );
      expectRecoveredSigner(firstDelegateMessages, firstDelegate.address);
      await expectValidErc1271Signatures(
        delegationContract,
        firstDelegateMessages,
      );
      await publishAllMessagesAndExpectSender(
        guardianMessageService,
        dataBusClient,
        firstDelegateContext,
        blockAfterEnact.number,
        blockAfterEnact.hash,
        firstDelegateMessages,
        firstDelegate.address,
      );
      await pauseDepositsAndExpectOnChain(
        securityService,
        firstDelegateContext,
        blockAfterEnact.number,
        firstDelegateMessages.pause.signature,
        firstDelegate.address,
      );
      await ensureDepositsUnpaused(deployment.dsmAddress);

      const delegationOwner = await delegationContract.owner();
      await accountImpersonate(delegationOwner);
      await setBalance(delegationOwner, 10);
      const delegationContractWithOwner = delegationContract.connect(
        testSetupProvider.getSigner(delegationOwner),
      );
      await (await delegationContractWithOwner.revokeDelegate()).wait();

      const blockAfterRevoke = await testSetupProvider.getBlock('latest');
      await expect(
        securityService.getGuardianExecutionContext({
          blockHash: blockAfterRevoke.hash,
        }),
      ).rejects.toThrow(
        `DelegationContract ${deployment.delegationContractAddress} has no active delegate`,
      );

      await (
        await delegationContractWithOwner.assignDelegate(secondDelegate.address)
      ).wait();
      const [, activeFrom] =
        await delegationContractWithOwner.getPendingDelegate();
      await testSetupProvider.send('evm_setNextBlockTimestamp', [
        activeFrom.toNumber(),
      ]);
      await testSetupProvider.send('evm_mine', []);

      const blockAfterRotation = await testSetupProvider.getBlock('latest');
      const secondDelegateContext =
        await securityService.getGuardianExecutionContext({
          blockHash: blockAfterRotation.hash,
        });

      expect(secondDelegateContext).toEqual(
        expect.objectContaining({
          dsmVersion: 5,
          mode: 'edf',
          delegateAddress: secondDelegate.address,
          guardianAddress: deployment.delegationContractAddress,
        }),
      );

      const secondDelegateMessages = await signAllMessages(
        securityService,
        walletService,
        secondDelegateContext,
        blockAfterRotation.number,
        blockAfterRotation.hash,
      );
      expectRecoveredSigner(secondDelegateMessages, secondDelegate.address);
      await expectValidErc1271Signatures(
        delegationContract,
        secondDelegateMessages,
      );
      await expectInvalidErc1271Signatures(
        delegationContract,
        firstDelegateMessages,
      );
      await publishAllMessagesAndExpectSender(
        guardianMessageService,
        dataBusClient,
        secondDelegateContext,
        blockAfterRotation.number,
        blockAfterRotation.hash,
        secondDelegateMessages,
        secondDelegate.address,
      );
      await pauseDepositsAndExpectOnChain(
        securityService,
        secondDelegateContext,
        blockAfterRotation.number,
        secondDelegateMessages.pause.signature,
        secondDelegate.address,
      );
    } finally {
      await moduleRef?.close();
    }
  });
});
