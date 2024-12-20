import { Block } from '@ethersproject/providers';
import { ethers } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';
import { TEST_SERVER_PORT } from './utils/constants';
import { DataBusClient } from './data-bus.client';
import {
  MessageDepositV1,
  MessagePauseV2,
  MessagePauseV3,
  MessagePingV1,
  MessagesDataMap,
  MessagesNames,
  MessageUnvetV1,
} from './data-bus.serializer';
import { HardhatServer } from '../../../test/helpers/hardhat-server';
import { accountImpersonate, setBalance } from '../../../test/helpers/provider';
import { getSecurityOwner } from '../../../test/helpers/dsm';

jest.setTimeout(40_000);

export const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const getVariants = (block: Block) => {
  const messages = [
    {
      name: 'MessagePingV1' as const,
      data: {
        blockNumber: block.number,
        app: { version: '0x' + '0'.repeat(64) },
      },
    },
    {
      name: 'MessageDepositV1' as const,
      data: {
        blockNumber: block.number,
        blockHash: block.hash as string,
        depositRoot: '0x' + '0'.repeat(64),
        stakingModuleId: randomInt(1, 5),
        nonce: randomInt(1, 100),
        signature: { r: '0x' + '0'.repeat(64), vs: '0x' + '0'.repeat(64) },
        app: { version: '0x' + '0'.repeat(64) },
      },
    },
    {
      name: 'MessageUnvetV1' as const,
      data: {
        blockNumber: block.number,
        blockHash: block.hash as string,
        stakingModuleId: randomInt(1, 5),
        nonce: randomInt(1, 100),
        operatorIds: formatBytes32String(
          'operator' + randomInt(1, 10).toString(),
        ),
        vettedKeysByOperator: formatBytes32String(
          'keys' + randomInt(1, 10).toString(),
        ),
        signature: { r: '0x' + '0'.repeat(64), vs: '0x' + '0'.repeat(64) },
        app: { version: '0x' + '0'.repeat(64) },
      },
    },
    {
      name: 'MessagePauseV2' as const,
      data: {
        blockNumber: block.number,
        blockHash: block.hash as string,
        signature: { r: '0x' + '0'.repeat(64), vs: '0x' + '0'.repeat(64) },
        stakingModuleId: randomInt(1, 5),
        app: { version: '0x' + '0'.repeat(64) },
      },
    },
    {
      name: 'MessagePauseV3' as const,
      data: {
        blockNumber: block.number,
        blockHash: block.hash as string,
        signature: { r: '0x' + '0'.repeat(64), vs: '0x' + '0'.repeat(64) },
        app: { version: '0x' + '0'.repeat(64) },
      },
    },
  ];

  return messages;
};

const getVariant = <Name extends MessagesNames>(
  name: Name,
  variants: ReturnType<typeof getVariants>,
): MessagesDataMap[Name] => {
  const dataVariant = variants.find((n) => n.name === name);
  if (!dataVariant) {
    throw new Error(`variant with name ${name} not found`);
  }
  return dataVariant.data as MessagesDataMap[Name];
};

describe('DataBus', () => {
  let provider: ethers.providers.JsonRpcProvider;
  let owner: ethers.Signer;
  let sdk: DataBusClient;
  let variants: ReturnType<typeof getVariants>;
  let hardhatServer: HardhatServer;
  let dsmOwnerAddress: string;

  const setupServer = async () => {
    hardhatServer = new HardhatServer();
    await hardhatServer.start();
  };

  beforeEach(async () => {
    await setupServer();
    dsmOwnerAddress = await getSecurityOwner();
    await accountImpersonate(dsmOwnerAddress);
    await setBalance(dsmOwnerAddress, 100);

    // Set up Ganache provider (ensure Ganache is running on port 8545)
    provider = new ethers.providers.JsonRpcProvider(
      'http://127.0.0.1:' + TEST_SERVER_PORT,
    );
    variants = getVariants(await provider.getBlock('latest'));

    // Get the first account as the owner
    // const accounts = await provider.listAccounts();
    owner = provider.getSigner(dsmOwnerAddress); //accounts[0]);

    // Deploy the DataBus contract from bytecode
    const dataBusBytecode =
      '0x6080604052348015600f57600080fd5b5061023e8061001f6000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c806323c640e714610030575b600080fd5b61004a60048036038101906100459190610126565b61004c565b005b3373ffffffffffffffffffffffffffffffffffffffff168383836040516100749291906101e4565b60405180910390a2505050565b600080fd5b600080fd5b6000819050919050565b61009e8161008b565b81146100a957600080fd5b50565b6000813590506100bb81610095565b92915050565b600080fd5b600080fd5b600080fd5b60008083601f8401126100e6576100e56100c1565b5b8235905067ffffffffffffffff811115610103576101026100c6565b5b60208301915083600182028301111561011f5761011e6100cb565b5b9250929050565b60008060006040848603121561013f5761013e610081565b5b600061014d868287016100ac565b935050602084013567ffffffffffffffff81111561016e5761016d610086565b5b61017a868287016100d0565b92509250509250925092565b600082825260208201905092915050565b82818337600083830152505050565b6000601f19601f8301169050919050565b60006101c38385610186565b93506101d0838584610197565b6101d9836101a6565b840190509392505050565b600060208201905081810360008301526101ff8184866101b7565b9050939250505056fea2646970667358221220826bce2fe59a712d479e84bbd2d619db54603716b7144a93a507d3ee391eb60f64736f6c634300081a0033'; // Replace with your contract's bytecode

    // The ABI for the DataBus contract functions
    const dataBusABI = ['function sendMessage(bytes32 _eventId, bytes _data)'];

    // Create a ContractFactory to deploy the contract
    const factory = new ethers.ContractFactory(
      dataBusABI,
      dataBusBytecode,
      owner,
    );
    const dataBusContract = await factory.deploy();
    await dataBusContract.deployed();

    const dataBusAddress = dataBusContract.address;
    // Create the SDK instance
    sdk = new DataBusClient(dataBusAddress, owner);
  });

  afterEach(async () => {
    await hardhatServer.stop();
  });

  it('should measure gas for sendPingMessage', async () => {
    const messageName = 'MessagePingV1' as const;
    const dataVariant: MessagePingV1 = getVariant(messageName, variants);

    const tx = await sdk.sendMessage(messageName, dataVariant);

    const receipt = await tx.wait();
    const { gasUsed } = receipt;

    console.log('Gas used for sendPingMessage:', gasUsed.toString());

    expect(gasUsed.toNumber()).toBeLessThanOrEqual(29847);

    const events = await sdk.get('MessagePingV1');
    const [event] = events;

    expect(event.data).toEqual(dataVariant);
    expect(event.guardianAddress).toEqual(await owner.getAddress());

    const allEvents = await sdk.getAll();
    expect(event).toEqual(allEvents[0]);
  });

  it('should measure gas for sendDepositMessage', async () => {
    const messageName = 'MessageDepositV1' as const;
    const dataVariant: MessageDepositV1 = getVariant(messageName, variants);

    const tx = await sdk.sendMessage(messageName, dataVariant);

    const receipt = await tx.wait();
    const { gasUsed } = receipt;

    console.log('Gas used for sendDepositMessage:', gasUsed.toString());

    expect(gasUsed.toNumber()).toBeLessThanOrEqual(31858);

    const events = await sdk.get(messageName);

    const [event] = events;
    const eventData = event.data;

    expect(eventData).toEqual(dataVariant);
    expect(event.guardianAddress).toEqual(await owner.getAddress());

    const allEvents = await sdk.getAll();
    expect(event).toEqual(allEvents[0]);
  });

  it('should measure gas for sendUnvetMessage', async () => {
    const messageName = 'MessageUnvetV1' as const;
    const dataVariant: MessageUnvetV1 = getVariant(messageName, variants);

    const tx = await sdk.sendMessage(messageName, dataVariant);

    const receipt = await tx.wait();
    const { gasUsed } = receipt;

    console.log('Gas used for sendUnvetMessage:', gasUsed.toString());

    expect(gasUsed.toNumber()).toBeLessThanOrEqual(34024);

    const events = await sdk.get('MessageUnvetV1');
    const [event] = events;

    expect(event.data).toEqual(dataVariant);
    expect(event.guardianAddress).toEqual(await owner.getAddress());

    const allEvents = await sdk.getAll();
    expect(event).toEqual(allEvents[0]);
  });

  it('should measure gas for sendPauseMessageV2', async () => {
    const messageName = 'MessagePauseV2';
    const dataVariant: MessagePauseV2 = getVariant(messageName, variants);

    const tx = await sdk.sendMessage(messageName, dataVariant as any);

    const receipt = await tx.wait();
    const { gasUsed } = receipt;

    console.log('Gas used for sendPauseMessageV2:', gasUsed.toString());

    expect(gasUsed.toNumber()).toBeLessThanOrEqual(31858);

    const events = await sdk.get(messageName);
    const [event] = events;

    expect(event.data).toEqual(dataVariant);
    expect(event.guardianAddress).toEqual(await owner.getAddress());

    const allEvents = await sdk.getAll();
    expect(event).toEqual(allEvents[0]);
  });

  it('should measure gas for sendPauseMessageV3', async () => {
    const messageName = 'MessagePauseV3' as const;
    const dataVariant: MessagePauseV3 = getVariant(messageName, variants);

    const tx = await sdk.sendMessage(messageName, dataVariant as any);

    const receipt = await tx.wait();
    const { gasUsed } = receipt;

    console.log('Gas used for sendPauseMessageV3:', gasUsed.toString());

    expect(gasUsed.toNumber()).toBeLessThanOrEqual(30213);

    const events = await sdk.get(messageName);
    const [event] = events;

    expect(event.data).toEqual(dataVariant);
    expect(event.guardianAddress).toEqual(await owner.getAddress());

    const allEvents = await sdk.getAll();
    expect(event).toEqual(allEvents[0]);
  });

  it('should throw a timeout error if the transaction does not complete within the specified time', async () => {
    jest.spyOn(sdk, 'sendTransaction').mockReturnValue(
      new Promise((resolve) => {
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          resolve({ wait: () => {} } as any);
        }, 6000);
      }),
    );

    const messageName = 'MessagePingV1' as const;
    const dataVariant: MessagePingV1 = getVariant(messageName, variants);

    await expect(
      sdk.sendMessage(messageName, dataVariant, 1000),
    ).rejects.toThrow('Data Bus transaction timed out after 1000ms');
  });
});
