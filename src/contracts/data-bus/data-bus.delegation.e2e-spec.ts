import { ethers } from 'ethers';
import {
  DelegationContractAbi__factory,
  SecurityV5Abi__factory,
} from 'generated';
import * as eventsAbi from '../../abi/data-bus.abi.json';
import { HardhatServer } from '../../../test/helpers/hardhat-server';
import * as dataBusFixture from '../../../test/fixtures/contracts/data-bus.bytecode.json';
import * as delegationContractFixture from '../../../test/fixtures/contracts/delegation-contract.bytecode.json';
import * as depositSecurityModuleV5Fixture from '../../../test/fixtures/contracts/deposit-security-module-v5.bytecode.json';
import { DataBusClient } from './data-bus.client';
import { MessageDepositV1 } from './data-bus.serializer';
import { TEST_SERVER_PORT } from './utils/constants';

jest.setTimeout(40_000);

describe('DataBus delegation', () => {
  let hardhatServer: HardhatServer;
  let provider: ethers.providers.JsonRpcProvider;

  beforeAll(async () => {
    hardhatServer = new HardhatServer();
    await hardhatServer.start();

    provider = new ethers.providers.JsonRpcProvider(
      `http://127.0.0.1:${TEST_SERVER_PORT}`,
    );
    (provider as any).waitForTransactionWithFallback = async (
      txHash: string,
    ) => ({
      receipt: await provider.waitForTransaction(txHash),
      pollCount: 1,
      elapsedMs: 0,
    });
  });

  afterAll(async () => {
    await hardhatServer.stop();
  });

  it('resolves a DSM guardian from a Data Bus sender filtered by active delegates', async () => {
    const deployer = provider.getSigner(0);
    const secondDelegate = provider.getSigner(1);
    const outsider = provider.getSigner(2);
    const delegateAddress = await deployer.getAddress();
    const secondDelegateAddress = await secondDelegate.getAddress();
    const outsiderAddress = await outsider.getAddress();

    const dataBusFactory = new ethers.ContractFactory(
      ['function sendMessage(bytes32 _eventId, bytes _data)'],
      dataBusFixture.bytecode,
      deployer,
    );
    const dataBus = await dataBusFactory.deploy();
    await dataBus.deployed();

    const delegationContractFactory = new ethers.ContractFactory(
      DelegationContractAbi__factory.abi,
      delegationContractFixture.bytecode,
      deployer,
    );
    const firstGuardian = await delegationContractFactory.deploy(
      ethers.Wallet.createRandom().address,
      delegateAddress,
      86_400,
    );
    await firstGuardian.deployed();
    const secondGuardian = await delegationContractFactory.deploy(
      ethers.Wallet.createRandom().address,
      secondDelegateAddress,
      86_400,
    );
    await secondGuardian.deployed();

    const dsmFactory = new ethers.ContractFactory(
      SecurityV5Abi__factory.abi,
      depositSecurityModuleV5Fixture.bytecode,
      deployer,
    );
    const dsmDeployment = await dsmFactory.deploy(
      ethers.Wallet.createRandom().address,
      ethers.Wallet.createRandom().address,
      100,
      200,
    );
    await dsmDeployment.deployed();

    const dsm = SecurityV5Abi__factory.connect(dsmDeployment.address, deployer);
    await (
      await dsm.addGuardians([firstGuardian.address, secondGuardian.address], 1)
    ).wait();

    const guardianAddresses = await dsm.getGuardians();
    const guardianDelegatePairs = await Promise.all(
      guardianAddresses.map(async (guardianAddress) => ({
        guardianAddress,
        delegateAddress: await DelegationContractAbi__factory.connect(
          guardianAddress,
          provider,
        ).getDelegate(),
      })),
    );
    const activeDelegateAddresses = guardianDelegatePairs.map(
      ({ delegateAddress: activeDelegate }) => activeDelegate,
    );
    const guardianByDelegate = new Map(
      guardianDelegatePairs.map(({ guardianAddress, delegateAddress }) => [
        delegateAddress.toLowerCase(),
        guardianAddress,
      ]),
    );

    expect(guardianAddresses).toEqual([
      firstGuardian.address,
      secondGuardian.address,
    ]);
    expect(activeDelegateAddresses).toEqual([
      delegateAddress,
      secondDelegateAddress,
    ]);

    const block = await provider.getBlock('latest');
    const messageName = 'MessageDepositV1' as const;
    const message: MessageDepositV1 = {
      blockNumber: block.number,
      blockHash: block.hash,
      depositRoot: ethers.constants.HashZero,
      stakingModuleId: 1,
      nonce: 1,
      signature: {
        r: ethers.constants.HashZero,
        vs: ethers.constants.HashZero,
      },
      app: { version: ethers.constants.HashZero },
    };

    await new DataBusClient(dataBus.address, outsider).sendMessage(
      messageName,
      message,
    );
    await new DataBusClient(dataBus.address, deployer).sendMessage(
      messageName,
      message,
    );

    const eventInterface = new ethers.utils.Interface(eventsAbi);
    const logs = await provider.getLogs({
      address: dataBus.address,
      fromBlock: block.number,
      toBlock: 'latest',
      topics: [
        eventInterface.getEventTopic(messageName),
        activeDelegateAddresses.map((activeDelegate) =>
          ethers.utils.hexZeroPad(activeDelegate, 32),
        ),
      ],
    });

    expect(logs).toHaveLength(1);

    const [log] = logs;
    const decodedData = ethers.utils.defaultAbiCoder.decode(
      ['bytes'],
      log.data,
    )[0];
    const parsedEvent = eventInterface.parseLog({
      ...log,
      data: decodedData,
    });
    const receivedSender = parsedEvent.args.guardianAddress as string;

    expect(receivedSender).toEqual(delegateAddress);
    expect(guardianByDelegate.get(receivedSender.toLowerCase())).toEqual(
      firstGuardian.address,
    );
    expect(receivedSender).not.toEqual(outsiderAddress);
  });
});
