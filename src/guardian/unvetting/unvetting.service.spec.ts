import { ConfigModule } from 'common/config';
import { Test, TestingModule } from '@nestjs/testing';
import { UnvettingService } from './unvetting.service';
import { SecurityModule, SecurityService } from 'contracts/security';
import {
  GuardianMessageModule,
  GuardianMessageService,
} from 'guardian/guardian-message';
import { mockKeys, mockKeys2 } from './fixtures';
import { LoggerModule } from 'common/logger';
import { UnvettingModule } from './unvetting.module';
import { PrometheusModule } from 'common/prometheus';
import { MockProviderModule } from 'provider';

jest.mock('../../transport/stomp/stomp.client');

describe('UnvettingService', () => {
  let service: UnvettingService;
  let securityService: SecurityService;
  let guardianMessageService: GuardianMessageService;

  const mockSecurityService = {
    signUnvetData: jest.fn().mockReturnValue(Promise.resolve('somesign')),
    unvetSigningKeys: jest.fn().mockImplementation(() => Promise.resolve()),
    getMaxOperatorsPerUnvetting: jest.fn().mockReturnValue(Promise.resolve(2)),
  };

  const mockGuardianMessageService = {
    sendUnvetMessage: jest.fn().mockImplementation(() => Promise.resolve()),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        MockProviderModule.forRoot(),
        SecurityModule,
        GuardianMessageModule,
        UnvettingModule,
      ],
    })
      .overrideProvider(SecurityService)
      .useValue(mockSecurityService)
      .overrideProvider(GuardianMessageService)
      .useValue(mockGuardianMessageService)
      .compile();

    service = moduleRef.get<UnvettingService>(UnvettingService);
    securityService = moduleRef.get<SecurityService>(SecurityService);
    guardianMessageService = moduleRef.get<GuardianMessageService>(
      GuardianMessageService,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNewVettedAmount', () => {
    it('should correctly pack chunks when maxOperatorsPerUnvetting is 2 with 3 operators', () => {
      const result = service.getNewVettedAmount(mockKeys, 2);

      const expected = [
        {
          operatorIds: '0x00000000000000010000000000000002',
          vettedKeysByOperator:
            '0x0000000000000000000000000000000000000000000000000000000000000002',
        },
        {
          operatorIds: '0x0000000000000003',
          vettedKeysByOperator: '0x00000000000000000000000000000000',
        },
      ];

      expect(result).toEqual(expected);
    });

    it('should correctly pack chunks when maxOperatorsPerUnvetting is 2 with 4 operators', () => {
      const result = service.getNewVettedAmount(mockKeys2, 2);

      const expected = [
        {
          operatorIds: '0x00000000000000010000000000000002',
          vettedKeysByOperator:
            '0x0000000000000000000000000000000000000000000000000000000000000002',
        },
        {
          operatorIds: '0x00000000000000030000000000000004',
          vettedKeysByOperator:
            '0x0000000000000000000000000000000000000000000000000000000000000001',
        },
      ];

      expect(result).toEqual(expected);
    });
  });

  describe('handleUnvetting', () => {
    it('should send two transactions', async () => {
      const unvetSigningKeysMock = jest.spyOn(
        securityService,
        'unvetSigningKeys',
      );
      const sendUnvetMessageMock = jest.spyOn(
        guardianMessageService,
        'sendUnvetMessage',
      );

      const blockData = {
        blockHash: '0x1',
        blockNumber: 1,
        guardianAddress: '0x1',
        guardianIndex: 1,
      } as any;

      const stakingModuleData = {
        invalidKeys: mockKeys,
        duplicatedKeys: [],
        frontRunKeys: [],
        nonce: 1,
        stakingModuleId: 1,
      } as any;

      await service.handleUnvetting(stakingModuleData, blockData);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(unvetSigningKeysMock).toBeCalledTimes(2);
      expect(unvetSigningKeysMock).toBeCalledWith(
        1,
        1,
        '0x1',
        1,
        '0x00000000000000010000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        'somesign',
      );

      expect(unvetSigningKeysMock).toBeCalledWith(
        1,
        1,
        '0x1',
        1,
        '0x0000000000000003',
        '0x00000000000000000000000000000000',
        'somesign',
      );
      expect(sendUnvetMessageMock).toBeCalledTimes(2);

      expect(sendUnvetMessageMock).toBeCalledWith({
        nonce: 1,
        blockNumber: 1,
        blockHash: '0x1',
        guardianAddress: '0x1',
        guardianIndex: 1,
        stakingModuleId: 1,
        operatorIds: '0x00000000000000010000000000000002',
        vettedKeysByOperator:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        signature: 'somesign',
      });

      expect(sendUnvetMessageMock).toBeCalledWith({
        nonce: 1,
        blockNumber: 1,
        blockHash: '0x1',
        guardianAddress: '0x1',
        guardianIndex: 1,
        stakingModuleId: 1,
        operatorIds: '0x0000000000000003',
        vettedKeysByOperator: '0x00000000000000000000000000000000',
        signature: 'somesign',
      });
    });

    it('should send three transactions', async () => {
      const unvetSigningKeysMock = jest.spyOn(
        securityService,
        'unvetSigningKeys',
      );
      const sendUnvetMessageMock = jest.spyOn(
        guardianMessageService,
        'sendUnvetMessage',
      );

      const blockData = {
        blockHash: '0x1',
        blockNumber: 1,
        guardianAddress: '0x1',
        guardianIndex: 1,
      } as any;

      const stakingModuleData = {
        invalidKeys: mockKeys2,
        duplicatedKeys: [],
        frontRunKeys: [],
        nonce: 1,
        stakingModuleId: 1,
      } as any;

      await service.handleUnvetting(stakingModuleData, blockData);

      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(unvetSigningKeysMock).toBeCalledTimes(2);
      expect(unvetSigningKeysMock).toBeCalledWith(
        1,
        1,
        '0x1',
        1,
        '0x00000000000000010000000000000002',
        '0x0000000000000000000000000000000000000000000000000000000000000002',
        'somesign',
      );

      expect(unvetSigningKeysMock).toBeCalledWith(
        1,
        1,
        '0x1',
        1,
        '0x00000000000000030000000000000004',
        '0x0000000000000000000000000000000000000000000000000000000000000001',
        'somesign',
      );
      expect(sendUnvetMessageMock).toBeCalledTimes(2);
      expect(sendUnvetMessageMock).toBeCalledWith({
        nonce: 1,
        blockNumber: 1,
        blockHash: '0x1',
        guardianAddress: '0x1',
        guardianIndex: 1,
        stakingModuleId: 1,
        operatorIds: '0x00000000000000010000000000000002',
        vettedKeysByOperator:
          '0x0000000000000000000000000000000000000000000000000000000000000002',
        signature: 'somesign',
      });

      expect(sendUnvetMessageMock).toBeCalledWith({
        nonce: 1,
        blockNumber: 1,
        blockHash: '0x1',
        guardianAddress: '0x1',
        guardianIndex: 1,
        stakingModuleId: 1,
        operatorIds: '0x00000000000000030000000000000004',
        vettedKeysByOperator:
          '0x0000000000000000000000000000000000000000000000000000000000000001',
        signature: 'somesign',
      });
    });
  });
});