import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { PrometheusModule } from 'common/prometheus';
import { MessagesModule, MessagesService } from 'messages';

import {
  GuardianMessageModule,
  GuardianMessageService,
} from '../guardian-message';

jest.mock('../../transport/stomp/stomp.client');

describe('GuardianService', () => {
  let loggerService: LoggerService;
  let guardianMessageService: GuardianMessageService;
  let messagesService: MessagesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        MessagesModule,
        GuardianMessageModule,
        PrometheusModule,
      ],
    }).compile();

    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
    messagesService = moduleRef.get(MessagesService);
    guardianMessageService = moduleRef.get(GuardianMessageService);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  });

  describe('addMessageMetaData', () => {
    it('should add extra data to message', () => {
      const message = { foo: 'bar' };
      const result = guardianMessageService.addMessageMetaData(message);

      expect(result).toEqual(
        expect.objectContaining({
          ...message,
          app: { version: expect.any(String), name: expect.any(String) },
        }),
      );
    });
  });

  describe('sendMessageFromGuardian', () => {
    it('should send message if guardian is in the list', async () => {
      const message = { guardianIndex: 1 } as any;
      const mockSendMessage = jest
        .spyOn(messagesService, 'sendMessage')
        .mockImplementation(async () => undefined);

      await guardianMessageService.sendMessageFromGuardian(message);

      expect(mockSendMessage).toBeCalledTimes(1);
      expect(mockSendMessage).toBeCalledWith(expect.objectContaining(message));
    });

    it('should not send message if guardian is not in the list', async () => {
      const message = { guardianIndex: -1 } as any;
      const mockSendMessage = jest
        .spyOn(messagesService, 'sendMessage')
        .mockImplementation(async () => undefined);

      await guardianMessageService.sendMessageFromGuardian(message);

      expect(mockSendMessage).not.toBeCalled();
    });
  });
});
