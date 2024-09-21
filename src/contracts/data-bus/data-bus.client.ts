import { Contract, providers, Signer, utils } from 'ethers';
import { DataBusAbi as DataBus } from 'generated';
import { TypedEvent } from 'generated/common';
import eventsAbi from '../../abi-human-readable/data-bus.abi.json';

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

  async sendMessage<EventName extends keyof DataBus['filters']>(
    eventName: EventName,
    data: Parameters<DataBus['filters'][EventName]>[0],
  ) {
    const event = this.eventsFragments.find(
      (ev) => ev.name === (eventName as string),
    );
    if (!event) {
      throw new Error(`Event with name "${eventName}" not found`);
    }
    const eventId = this.eventsInterface.getEventTopic(event);
    const dataBytes = utils.defaultAbiCoder.encode(
      [event.inputs[1].type],
      [data],
    );

    const tx = await this.dataBus.sendMessage(eventId, dataBytes);
    await tx.wait();
    return tx;
  }

  async get<EventName extends keyof DataBus['filters']>(
    eventName: EventName,
    blockFrom = 0,
    blockTo: number | string = 'latest',
  ): Promise<Array<TypedEvent<any> & { name: string; txHash: string }>> {
    const event = this.eventsFragments.find(
      (ev) => ev.name === (eventName as string),
    );
    if (!event) {
      throw new Error(`Event with name "${eventName}" not found`);
    }

    const topic = this.eventsInterface.getEventTopic(event);
    return this.getByTopics([topic], blockFrom, blockTo);
  }

  async getAll(
    blockFrom = 0,
    blockTo: number | string = 'latest',
  ): Promise<Array<TypedEvent<any> & { name: string; txHash: string }>> {
    const topics = this.eventsFragments.map((event) =>
      this.eventsInterface.getEventTopic(event),
    );
    return this.getByTopics(topics, blockFrom, blockTo);
  }

  private async getByTopics(
    topics: string[],
    blockFrom: number,
    blockTo: number | string,
  ) {
    const filter: providers.Filter = {
      address: this.dataBusAddress,
      topics: [topics],
      fromBlock: blockFrom,
      toBlock: blockTo,
    };
    const result: Array<TypedEvent<any> & { name: string; txHash: string }> =
      [];
    const logs = await this.provider.getLogs(filter);
    for (const log of logs) {
      const data = this.eventsInterface.parseLog(log);
      if (!data) continue;

      result.push({
        ...data.args,
        name: data.name,
        txHash: log.transactionHash,
      } as any);
    }

    return result;
  }
}
