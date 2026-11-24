import { formatBytes32String } from 'ethers/lib/utils';
import { MessageType } from 'messages/interfaces';
import { DataBusClient } from './data-bus.client';
import { DSMMessageSender } from './dsm-message-sender.client';

describe('DSMMessageSender', () => {
  const app = { version: '1.0.0' };

  let sendMessage: jest.Mock;
  let sender: DSMMessageSender;

  beforeEach(() => {
    sendMessage = jest.fn().mockResolvedValue(undefined);
    sender = new DSMMessageSender({ sendMessage } as unknown as DataBusClient);
  });

  it('sends a ping without a DSM version', async () => {
    await sender.sendMessage({
      type: MessageType.PING,
      blockNumber: 10,
      guardianIndex: 0,
      guardianAddress: '0x0000000000000000000000000000000000000001',
      app,
    } as any);

    expect(sendMessage).toHaveBeenCalledWith('MessagePingV1', {
      blockNumber: 10,
      app: { version: formatBytes32String(app.version) },
    });
  });

  it('rejects a message for DSM v4', async () => {
    await expect(
      sender.sendMessage({
        type: MessageType.PING,
        blockNumber: 10,
        guardianIndex: 0,
        guardianAddress: '0x0000000000000000000000000000000000000001',
        dsmVersion: 4,
        app,
      } as any),
    ).rejects.toThrow('Unsupported DSM contract version: 4');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
