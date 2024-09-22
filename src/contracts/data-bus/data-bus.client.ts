import { Contract, providers, Signer, utils } from 'ethers';
import { EventDataMap, eventMappers } from './data-bus.serializer';
import { MessagesDataMap, MessagesNames } from './message.interface';
// import eventsAbi from '../../abi-human-readable/data-bus.abi.json';
const eventsAbi = [
  'event MessageDepositV1(address indexed guardianAddress, (uint256 blockNumber, bytes32 blockHash, bytes32 depositRoot, uint256 stakingModuleId, uint256 nonce, (bytes32 r, bytes32 vs) signature, (bytes32 version) app) data)',
  'event MessagePauseV2(address indexed guardianAddress, (uint256 blockNumber, bytes32 blockHash, (bytes32 r, bytes32 vs) signature, uint256 stakingModuleId, (bytes32 version) app) data)',
  'event MessagePauseV3(address indexed guardianAddress, (uint256 blockNumber, bytes32 blockHash, (bytes32 r, bytes32 vs) signature, (bytes32 version) app) data)',
  'event MessagePingV1(address indexed guardianAddress, (uint256 blockNumber, (bytes32 version) app) data)',
  'event MessageUnvetV1(address indexed guardianAddress, (uint256 blockNumber, bytes32 blockHash, uint256 stakingModuleId, uint256 nonce, bytes operatorIds, bytes vettedKeysByOperator, (bytes32 r, bytes32 vs) signature, (bytes32 version) app) data)',
];

export class DataBusClient {
  private dataBusAddress: string;
  private eventsInterface: utils.Interface;
  private provider: providers.Provider;
  private eventsFragments: utils.EventFragment[] = [];
  private dataBus: any;

  constructor(dataBusAddress: string, signer: Signer) {
    this.dataBusAddress = dataBusAddress;
    this.eventsInterface = new utils.Interface(eventsAbi);

    if (!signer.provider) {
      throw new Error('Signer with provider is required');
    }
    this.provider = signer.provider;
    this.eventsFragments = Object.values(this.eventsInterface.events);
    this.dataBus = new Contract(
      dataBusAddress,
      ['function sendMessage(bytes32 _eventId, bytes _data)'],
      signer,
    );
  }

  async sendMessage<EventName extends MessagesNames>(
    eventName: EventName,
    data: MessagesDataMap[EventName],
  ) {
    const event = this.eventsFragments.find(
      (ev) => ev.name === (eventName as string),
    );
    if (!event) {
      throw new Error(`Event with name "${eventName}" not found`);
    }
    const eventId = this.eventsInterface.getEventTopic(event);
    const dataBytes = utils.defaultAbiCoder.encode(
      [event.inputs[1].format('full')],
      [data],
    );

    const tx = await this.dataBus.sendMessage(eventId, dataBytes);
    await tx.wait();
    return tx;
  }

  async get<EventName extends keyof EventDataMap>(
    eventName: EventName,
    blockFrom = 0,
    blockTo: number | string = 'latest',
  ): Promise<
    Array<EventDataMap[EventName] & { name: EventName; txHash: string }>
  > {
    const event = this.eventsFragments.find(
      (ev) => ev.name === (eventName as string),
    );
    if (!event) {
      throw new Error(`Event with name "${eventName}" not found`);
    }

    const topic = this.eventsInterface.getEventTopic(event);
    return this.getByTopics([topic], blockFrom, blockTo) as Promise<
      Array<EventDataMap[EventName] & { name: EventName; txHash: string }>
    >;
  }

  async getAll(
    blockFrom = 0,
    blockTo: number | string = 'latest',
  ): Promise<
    Array<EventDataMap[keyof EventDataMap] & { name: string; txHash: string }>
  > {
    const topics = this.eventsFragments.map((event) =>
      this.eventsInterface.getEventTopic(event),
    );
    return this.getByTopics(topics, blockFrom, blockTo);
  }

  private async getByTopics(
    topics: string[],
    blockFrom: number,
    blockTo: number | string,
  ): Promise<
    Array<EventDataMap[keyof EventDataMap] & { name: string; txHash: string }>
  > {
    const filter: providers.Filter = {
      address: this.dataBusAddress,
      topics: [topics],
      fromBlock: blockFrom,
      toBlock: blockTo,
    };
    const result: Array<
      EventDataMap[keyof EventDataMap] & { name: string; txHash: string }
    > = [];

    const logs = await this.provider.getLogs(filter);

    for (const log of logs) {
      const decodedData = utils.defaultAbiCoder.decode(['bytes'], log.data)[0];
      const data = this.eventsInterface.parseLog({
        ...log,
        data: decodedData,
      });

      if (!data) continue;

      const mapper = eventMappers[data.name];
      if (!mapper) {
        continue;
      }

      const mappedData = mapper(data.args);

      // Assign txHash and name
      mappedData.txHash = log.transactionHash;
      mappedData.name = data.name;

      result.push(mappedData);
    }

    return result;
  }
}
