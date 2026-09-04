import { SecretKey } from '@chainsafe/blst';
import { TestingModule } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { ethers } from 'ethers';
import { DepositAbi, DepositAbi__factory } from 'generated';
import { DepositEventEvent } from 'generated/DepositAbi';
import { DepositData } from 'bls/bls.containers';
import { parseLittleEndian64 } from 'contracts/deposits-registry/crypto';
import { VerifiedDepositEvent } from 'contracts/deposits-registry/interfaces';
import { DepositRegistrySanityCheckerService } from 'contracts/deposits-registry/sanity-checker';
import { DepositTree } from 'contracts/deposits-registry/sanity-checker/integrity-checker/deposit-tree';
import {
  METRIC_CONSECUTIVE_FRESH_DEPOSIT_ROOT_MISMATCHES,
  METRIC_FRESH_DEPOSIT_ROOT_MISMATCHES,
} from 'contracts/deposits-registry/sanity-checker/sanity-checker.metrics';
import { RepositoryService } from 'contracts/repository';
import { Counter, Gauge } from 'prom-client';
import { CHAIN_ID } from './helpers/config';
import { signDeposit } from './helpers/deposit';
import { HardhatServer } from './helpers/hardhat-server';
import { testSetupProvider } from './helpers/provider';
import { setupTestingModule } from './helpers/test-setup';

jest.setTimeout(180_000);

const DEPOSIT_CONTRACT_ADDRESS = '0x00000000219ab540356cBB839Cbe05303d7705Fa';
const WITHDRAWAL_CREDENTIALS =
  '0x0100000000000000000000000000000000000000000000000000000000000000';

const observeMetrics = (moduleRef: TestingModule) => ({
  freshRootMismatches: {
    inc: jest.spyOn(
      moduleRef.get<Counter<string>>(
        getToken(METRIC_FRESH_DEPOSIT_ROOT_MISMATCHES),
      ),
      'inc',
    ),
  },
  consecutiveFreshRootMismatches: {
    inc: jest.spyOn(
      moduleRef.get<Gauge<string>>(
        getToken(METRIC_CONSECUTIVE_FRESH_DEPOSIT_ROOT_MISMATCHES),
      ),
      'inc',
    ),
    set: jest.spyOn(
      moduleRef.get<Gauge<string>>(
        getToken(METRIC_CONSECUTIVE_FRESH_DEPOSIT_ROOT_MISMATCHES),
      ),
      'set',
    ),
  },
});

const toVerifiedDepositEvent = (
  event: DepositEventEvent,
): VerifiedDepositEvent => {
  const {
    pubkey,
    withdrawal_credentials: wc,
    amount,
    signature,
    index,
  } = event.args;

  return {
    pubkey,
    wc,
    amount,
    signature,
    index,
    tx: event.transactionHash,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    logIndex: event.logIndex,
    depositCount: parseLittleEndian64(index),
    depositDataRoot: DepositTree.formDepositNode({
      pubkey,
      wc,
      signature,
      amount,
    }),
    valid: true,
  };
};

const submitDeposit = async (depositContract: DepositAbi, keySeed: number) => {
  const secretKey = SecretKey.fromKeygen(new Uint8Array(32).fill(keySeed));
  const publicKey = secretKey.toPublicKey().toBytes();
  const { depositData } = await signDeposit(
    publicKey,
    secretKey,
    WITHDRAWAL_CREDENTIALS,
  );
  const depositDataRoot = DepositData.hashTreeRoot(depositData);

  const transaction = await depositContract.deposit(
    depositData.pubkey,
    depositData.withdrawalCredentials,
    depositData.signature,
    depositDataRoot,
    { value: ethers.constants.WeiPerEther.mul(32) },
  );
  const receipt = await transaction.wait();
  const [event] = await depositContract.queryFilter(
    depositContract.filters.DepositEvent(),
    receipt.blockNumber,
    receipt.blockNumber,
  );

  if (!event) throw new Error('DepositEvent was not emitted');

  return toVerifiedDepositEvent(event);
};

const resetDepositContract = async (depositContract: DepositAbi) => {
  const depositCountSlot = DepositTree.DEPOSIT_CONTRACT_TREE_DEPTH;

  for (let slot = 0; slot <= depositCountSlot; slot++) {
    await testSetupProvider.send('hardhat_setStorageAt', [
      depositContract.address,
      ethers.utils.hexValue(slot),
      ethers.constants.HashZero,
    ]);
  }

  const depositRoot = await depositContract.get_deposit_root();
  if (depositRoot !== new DepositTree().getRoot()) {
    throw new Error('Deposit contract was not reset to the empty tree');
  }
};

type ForkScenario = {
  moduleRef: TestingModule;
  sanityChecker: DepositRegistrySanityCheckerService;
  metrics: ReturnType<typeof observeMetrics>;
  deposit: (keySeed: number) => Promise<VerifiedDepositEvent>;
};

const createForkScenario = async (): Promise<ForkScenario> => {
  const depositContract = DepositAbi__factory.connect(
    DEPOSIT_CONTRACT_ADDRESS,
    testSetupProvider.getSigner(0),
  );
  await resetDepositContract(depositContract);
  const baseBlock = await testSetupProvider.getBlock('latest');

  const moduleRef = await setupTestingModule();
  const repository = moduleRef.get(RepositoryService);
  await repository.initCachedContracts({ blockHash: baseBlock.hash });

  const sanityChecker = moduleRef.get(DepositRegistrySanityCheckerService);
  await sanityChecker.initialize({
    headers: { startBlock: baseBlock.number, endBlock: baseBlock.number },
    data: [],
  });

  return {
    moduleRef,
    sanityChecker,
    metrics: observeMetrics(moduleRef),
    deposit: (keySeed: number) => submitDeposit(depositContract, keySeed),
  };
};

describe('DepositRegistrySanityCheckerService fresh events fork', () => {
  let hardhatServer: HardhatServer;
  let snapshotId: string;
  let scenario: ForkScenario;
  let originalChainId: string | undefined;

  beforeAll(async () => {
    originalChainId = process.env.CHAIN_ID;
    process.env.CHAIN_ID = String(CHAIN_ID);
    hardhatServer = new HardhatServer();
    await hardhatServer.start();
  });

  beforeEach(async () => {
    snapshotId = await testSetupProvider.send('evm_snapshot', []);
    scenario = await createForkScenario();
  });

  afterEach(async () => {
    await scenario?.moduleRef.close();
    jest.restoreAllMocks();
    await testSetupProvider.send('evm_revert', [snapshotId]);
  });

  afterAll(async () => {
    await hardhatServer.stop();
    if (originalChainId === undefined) delete process.env.CHAIN_ID;
    else process.env.CHAIN_ID = originalChainId;
  });

  it('accepts all deposit events through the cycle block', async () => {
    const { sanityChecker, metrics, deposit } = scenario;
    const firstEvent = await deposit(17);
    const secondEvent = await deposit(18);

    await expect(
      sanityChecker.verifyFreshEvents(secondEvent.blockHash, [
        firstEvent,
        secondEvent,
      ]),
    ).resolves.toBe(true);
    expect(metrics.freshRootMismatches.inc).not.toHaveBeenCalled();
    expect(metrics.consecutiveFreshRootMismatches.set).toHaveBeenCalledWith(0);
  });

  it('rejects a contiguous prefix when the cycle block contains a later deposit', async () => {
    const { sanityChecker, metrics, deposit } = scenario;
    const firstEvent = await deposit(19);

    await expect(
      sanityChecker.verifyFreshEvents(firstEvent.blockHash, [firstEvent]),
    ).resolves.toBe(true);

    const secondEvent = await deposit(20);
    expect(secondEvent.depositCount).toBe(firstEvent.depositCount + 1);

    // Simulate eth_getLogs returning only the contiguous prefix.
    await expect(
      sanityChecker.verifyFreshEvents(secondEvent.blockHash, [firstEvent]),
    ).resolves.toBe(false);
    expect(metrics.freshRootMismatches.inc).toHaveBeenCalledTimes(1);
    expect(metrics.consecutiveFreshRootMismatches.inc).toHaveBeenCalledTimes(1);
  });
});
