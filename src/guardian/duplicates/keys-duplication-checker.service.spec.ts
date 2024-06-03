import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import {
  SigningKeyEventsCacheModule,
  SigningKeyEventsCacheService,
} from 'contracts/signing-key-events-cache';
import { KeysDuplicationCheckerModule } from './keys-duplication-checker.module';
import { KeysDuplicationCheckerService } from './keys-duplication-checker.service';
import {
  eventMock,
  keyMock1,
  keyMock1Duplicate,
  keysMock,
} from './keys.fixtures';
import { ConfigModule } from 'common/config';
import { MockProviderModule } from 'provider';
import { BlockData } from 'guardian/interfaces';

describe('KeysDuplicationCheckerService', () => {
  let service: KeysDuplicationCheckerService;
  const mockSigningKeyEventsCacheService = {
    getUpdatedSigningKeyEvents: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        KeysDuplicationCheckerModule,
        SigningKeyEventsCacheModule,
      ],
    })
      .overrideProvider(SigningKeyEventsCacheService)
      .useValue(mockSigningKeyEventsCacheService)
      .compile();

    service = moduleRef.get<KeysDuplicationCheckerService>(
      KeysDuplicationCheckerService,
    );
  });

  describe('findDuplicateKeys', () => {
    it('should identify and return tuples of duplicated keys along with their occurrences', () => {
      const result = service.findDuplicateKeys(keysMock);
      const expectedKey =
        '0xb3c90525010a5710d43acbea46047fc37ed55306d032527fa15dd7e8cd8a9a5fa490347cc5fce59936fb8300683cd9f3';
      const expectedOccurrences = keysMock.filter(
        (key) => key.key === expectedKey,
      );

      // Check the number of groups of duplicated keys identified
      expect(result.length).toEqual(1);

      const [key, occurrences] = result[0];
      expect(key).toEqual(expectedKey);
      expect(occurrences.length).toEqual(2);
      expect(occurrences).toEqual(expect.arrayContaining(expectedOccurrences));
    });
  });

  describe('getDuplicatedKeys', () => {
    it('duplicates across one operator', async () => {
      const result = await service.getDuplicatedKeys(keysMock, {} as BlockData);

      const expected = [keyMock1Duplicate];

      expect(result.length).toEqual(1);
      expect(result).toEqual(expect.arrayContaining(expected));
    });

    it('original key is deposited', async () => {
      const result = await service.getDuplicatedKeys(
        [
          ...keysMock,
          {
            ...keyMock1Duplicate,
            used: true,
            operatorIndex: keyMock1Duplicate.operatorIndex + 1,
          },
        ],
        {} as BlockData,
      );

      const expected = [keyMock1, keyMock1Duplicate];

      expect(result).toEqual(expect.arrayContaining(expected));
      expect(result[0].used).toBeFalsy();
      expect(result[1].used).toBeFalsy();
    });

    it('original key is deposited and from another module', async () => {
      const result = await service.getDuplicatedKeys(
        [
          ...keysMock,
          {
            ...keyMock1Duplicate,
            used: true,
            operatorIndex: keyMock1Duplicate.operatorIndex + 1,
            moduleAddress: '0x12344556',
          },
        ],
        {} as BlockData,
      );

      const expected = [keyMock1, keyMock1Duplicate];

      expect(result).toEqual(expect.arrayContaining(expected));
      expect(result[0].used).toBeFalsy();
      expect(result[1].used).toBeFalsy();
    });

    describe('duplicate across two operators', () => {
      it('keys were added in different blocks', async () => {
        mockSigningKeyEventsCacheService.getUpdatedSigningKeyEvents.mockImplementationOnce(
          async () => {
            return {
              events: [
                eventMock,
                { ...eventMock, logIndex: eventMock.logIndex + 1 },
                {
                  ...eventMock,
                  operatorIndex: keyMock1Duplicate.operatorIndex + 1,
                  blockNumber: eventMock.blockNumber + 1,
                },
              ],
            };
          },
        );

        const result = await service.getDuplicatedKeys(
          [
            ...keysMock,
            {
              ...keyMock1Duplicate,
              used: false,
              operatorIndex: keyMock1Duplicate.operatorIndex + 1,
            },
          ],
          {} as BlockData,
        );

        const expected = [
          keyMock1Duplicate,
          {
            ...keyMock1Duplicate,
            used: false,
            operatorIndex: keyMock1Duplicate.operatorIndex + 1,
          },
        ];

        expect(result).toEqual(expected);
      });

      it('keys were added in the same block', async () => {
        mockSigningKeyEventsCacheService.getUpdatedSigningKeyEvents.mockImplementationOnce(
          async () => {
            return {
              events: [
                eventMock,
                { ...eventMock, logIndex: eventMock.logIndex + 1 },
                {
                  ...eventMock,
                  operatorIndex: keyMock1Duplicate.operatorIndex + 1,
                  logIndex: eventMock.logIndex + 2,
                },
              ],
            };
          },
        );

        const result = await service.getDuplicatedKeys(
          [
            ...keysMock,
            {
              ...keyMock1Duplicate,
              used: false,
              operatorIndex: keyMock1Duplicate.operatorIndex + 1,
            },
          ],
          {} as BlockData,
        );

        const expected = [
          keyMock1Duplicate,
          {
            ...keyMock1Duplicate,
            used: false,
            operatorIndex: keyMock1Duplicate.operatorIndex + 1,
          },
        ];

        expect(result).toEqual(expected);
      });

      it('should throw error if no event for operator', async () => {
        mockSigningKeyEventsCacheService.getUpdatedSigningKeyEvents.mockImplementationOnce(
          async () => {
            return {
              events: [
                eventMock,
                { ...eventMock, logIndex: eventMock.logIndex + 1 },
              ],
            };
          },
        );

        await expect(
          service.getDuplicatedKeys(
            [
              ...keysMock,
              {
                ...keyMock1Duplicate,
                used: false,
                operatorIndex: keyMock1Duplicate.operatorIndex + 1,
              },
            ],
            {} as BlockData,
          ),
        ).rejects.toThrow('Missing events for some operators');
      });
    });
  });
});