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
import { StakingRouterModule } from 'contracts/staking-router';
import { RepositoryModule } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
describe('KeysDuplicationCheckerService', () => {
  let service: KeysDuplicationCheckerService;
  const mockSigningKeyEventsCacheService = {
    getUpdatedSigningKeyEvents: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        StakingRouterModule,
        RepositoryModule,
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

    const loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
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

      const expected = { duplicates: [keyMock1Duplicate], unresolved: [] };

      expect(result.duplicates.length).toEqual(1);
      expect(result.duplicates).toEqual(
        expect.arrayContaining(expected.duplicates),
      );
      expect(result.unresolved).toEqual([]);
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

      const expected = {
        duplicates: [keyMock1, keyMock1Duplicate],
        unresolved: [],
      };

      expect(result.duplicates).toEqual(
        expect.arrayContaining(expected.duplicates),
      );
      expect(result.duplicates[0].used).toBeFalsy();
      expect(result.duplicates[1].used).toBeFalsy();

      expect(result.unresolved).toEqual([]);
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

      const expected = {
        duplicates: [keyMock1, keyMock1Duplicate],
        unresolved: [],
      };

      expect(result.duplicates).toEqual(
        expect.arrayContaining(expected.duplicates),
      );
      expect(result.duplicates[0].used).toBeFalsy();
      expect(result.duplicates[1].used).toBeFalsy();

      expect(result.unresolved).toEqual([]);
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

        const expected = {
          duplicates: [
            keyMock1Duplicate,
            {
              ...keyMock1Duplicate,
              used: false,
              operatorIndex: keyMock1Duplicate.operatorIndex + 1,
            },
          ],
          unresolved: [],
        };

        expect(result.duplicates).toEqual(
          expect.arrayContaining(expected.duplicates),
        );
        expect(result.unresolved).toEqual([]);
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

        const expected = {
          duplicates: [
            keyMock1Duplicate,
            {
              ...keyMock1Duplicate,
              used: false,
              operatorIndex: keyMock1Duplicate.operatorIndex + 1,
            },
          ],
          unresolved: [],
        };

        expect(result.duplicates).toEqual(
          expect.arrayContaining(expected.duplicates),
        );
      });

      it('should return unresolved keys list if no event for operator', async () => {
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

        const expected = [
          keyMock1,
          keyMock1Duplicate,
          {
            ...keyMock1Duplicate,
            used: false,
            operatorIndex: keyMock1Duplicate.operatorIndex + 1,
          },
        ];

        const { duplicates, unresolved } = await service.getDuplicatedKeys(
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

        expect(duplicates).toEqual([]);
        expect(unresolved).toEqual(expect.arrayContaining(expected));
      });
    });
  });
});
