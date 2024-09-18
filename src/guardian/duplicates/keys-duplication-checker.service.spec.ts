import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import {
  SigningKeysRegistryModule,
  SigningKeysRegistryService,
} from 'contracts/signing-keys-registry';
import { KeysDuplicationCheckerModule } from './keys-duplication-checker.module';
import { KeysDuplicationCheckerService } from './keys-duplication-checker.service';
import { eventMock1, keyMock1, keyMock2 } from './keys.fixtures';
import { ConfigModule } from 'common/config';
import { MockProviderModule } from 'provider';
import { BlockData } from 'guardian/interfaces';
import { StakingRouterModule } from 'contracts/staking-router';
import { RepositoryModule } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
describe('KeysDuplicationCheckerService', () => {
  let service: KeysDuplicationCheckerService;
  const mockSigningKeysRegistryService = {
    getUpdatedSigningKeyEvents: jest.fn(),
  };

  const emptyBlockData = {} as BlockData;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        StakingRouterModule,
        RepositoryModule,
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        KeysDuplicationCheckerModule,
        SigningKeysRegistryModule.register('latest'),
      ],
    })
      .overrideProvider(SigningKeysRegistryService)
      .useValue(mockSigningKeysRegistryService)
      .compile();

    service = moduleRef.get<KeysDuplicationCheckerService>(
      KeysDuplicationCheckerService,
    );

    const loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
  });

  describe('getDuplicateKeyGroups', () => {
    it('should identify and return tuples of duplicated keys along with their occurrences', () => {
      const result = service.getDuplicateKeyGroups([
        { ...keyMock1, index: 1 },
        { ...keyMock1, index: 2 },
        { ...keyMock2, index: 3 },
        { ...keyMock2, index: 4 },
      ]);

      // Check the number of groups of duplicated keys identified
      expect(result.length).toEqual(2);

      expect(result[0][0]).toEqual(keyMock1.key);
      expect(result[0][1].length).toEqual(2);
      expect(result[0][1]).toEqual([
        { ...keyMock1, index: 1 },
        { ...keyMock1, index: 2 },
      ]);

      expect(result[1][0]).toEqual(keyMock2.key);
      expect(result[1][1].length).toEqual(2);
      expect(result[1][1]).toEqual([
        { ...keyMock2, index: 3 },
        { ...keyMock2, index: 4 },
      ]);
    });
  });

  describe('getDuplicatedKeys', () => {
    describe('Detect duplicates within a single operator', () => {
      it('Returns unused keys as duplicates if the list contains a deposited key', async () => {
        // will be return key with smallest index
        // deposited keys has a smallest index
        const unusedKey = { ...keyMock1, index: 2, used: false };
        const usedKey = { ...keyMock1, index: 1, used: true };
        const duplicatedKeysAmongSingleOperator = [unusedKey, usedKey];

        const result = await service.getDuplicatedKeys(
          duplicatedKeysAmongSingleOperator,
          emptyBlockData,
        );

        expect(result.duplicates).toEqual([unusedKey]);
        expect(result.unresolved).toEqual([]);
      });

      it('Identifies the key with the smallest index as the earliest and returns the others as duplicates', async () => {
        const unusedKey1 = { ...keyMock1, index: 1, used: false };
        const unusedKey2 = { ...keyMock1, index: 2, used: false };
        const duplicatedKeysAmongSingleOperator = [unusedKey1, unusedKey2];

        const result = await service.getDuplicatedKeys(
          duplicatedKeysAmongSingleOperator,
          emptyBlockData,
        );

        expect(result.duplicates).toEqual([unusedKey2]);
        expect(result.unresolved).toEqual([]);
      });
    });

    describe('Detect duplicates across multiple operators within the same module', () => {
      it('Returns unused keys as duplicates if the list contains a deposited key', async () => {
        const unusedKey = { ...keyMock1, used: false, operatorIndex: 1 };
        const usedKey = { ...keyMock1, used: true, operatorIndex: 2 };
        const duplicatedKeysAmongMultipleOperator = [unusedKey, usedKey];

        const result = await service.getDuplicatedKeys(
          duplicatedKeysAmongMultipleOperator,
          emptyBlockData,
        );

        expect(result.duplicates).toEqual([unusedKey]);
        expect(result.unresolved).toEqual([]);
      });

      describe('Detect duplicates based on SigningKeyAdded events', () => {
        it('Returns all keys as unresolved if there is no event for operator', async () => {
          const unusedKey1 = { ...keyMock1, used: false, operatorIndex: 1 };
          const unusedKey2 = { ...keyMock1, used: false, operatorIndex: 2 };

          // unresolved will not influence detection of other keys duplicates
          const unusedKey3 = { ...keyMock2, used: false, operatorIndex: 1 };
          const usedKeys = { ...keyMock2, used: true, operatorIndex: 2 };

          const keyMock1Event = {
            ...eventMock1,
            operatorIndex: 1,
            logIndex: 1,
            blockNumber: 1,
          };

          mockSigningKeysRegistryService.getUpdatedSigningKeyEvents.mockImplementationOnce(
            async () => {
              return {
                events: [keyMock1Event],
                isValid: true,
              };
            },
          );

          const duplicatedKeysAmongMultipleOperators = [
            unusedKey1,
            unusedKey2,
            unusedKey3,
            usedKeys,
          ];

          const result = await service.getDuplicatedKeys(
            duplicatedKeysAmongMultipleOperators,
            emptyBlockData,
          );

          expect(result.duplicates).toEqual([unusedKey3]);
          expect(result.unresolved).toEqual([unusedKey1, unusedKey2]);
        });

        it('Returns all keys as duplicates if multiple events occur in the smallest block', async () => {
          const unusedKey1 = { ...keyMock1, used: false, operatorIndex: 1 };
          const unusedKey2 = { ...keyMock1, used: false, operatorIndex: 2 };

          const keyMock1Event = {
            ...eventMock1,
            operatorIndex: 1,
            logIndex: 1,
            blockNumber: 1,
          };

          const keyMock2Event = {
            ...eventMock1,
            operatorIndex: 2,
            logIndex: 2,
            blockNumber: 1,
          };

          mockSigningKeysRegistryService.getUpdatedSigningKeyEvents.mockImplementationOnce(
            async () => {
              return {
                events: [keyMock1Event, keyMock2Event],
                isValid: true,
              };
            },
          );

          const duplicatedKeysAmongMultipleOperators = [unusedKey1, unusedKey2];

          const result = await service.getDuplicatedKeys(
            duplicatedKeysAmongMultipleOperators,
            emptyBlockData,
          );

          expect(result.duplicates).toEqual([unusedKey1, unusedKey2]);
          expect(result.unresolved).toEqual([]);
        });

        it('Returns all keys as duplicates except the one with the smallest block number and key index', async () => {
          const unusedKey1 = {
            ...keyMock1,
            index: 1,
            used: false,
            operatorIndex: 1,
          };
          const unusedKey2 = {
            ...keyMock1,
            index: 2,
            used: false,
            operatorIndex: 1,
          };
          const unusedKey3 = { ...keyMock1, used: false, operatorIndex: 2 };

          const keyMock1Event = {
            ...eventMock1,
            operatorIndex: 1,
            logIndex: 1,
            blockNumber: 1,
          };

          const keyMock2Event = {
            ...eventMock1,
            operatorIndex: 2,
            logIndex: 1,
            blockNumber: 2,
          };

          mockSigningKeysRegistryService.getUpdatedSigningKeyEvents.mockImplementationOnce(
            async () => {
              return {
                events: [keyMock1Event, keyMock2Event],
                isValid: true,
              };
            },
          );

          const duplicatedKeysAmongMultipleOperators = [
            unusedKey1,
            unusedKey2,
            unusedKey3,
          ];

          const result = await service.getDuplicatedKeys(
            duplicatedKeysAmongMultipleOperators,
            emptyBlockData,
          );

          expect(result.duplicates).toEqual([unusedKey2, unusedKey3]);
          expect(result.unresolved).toEqual([]);
        });
      });
    });

    describe('Detect duplicates across multiple operators in different modules', () => {
      it('Returns unused keys as duplicates if the list contains a deposited key', async () => {
        const unusedKey = {
          ...keyMock1,
          used: false,
          moduleAddress: 'address1',
        };
        const usedKey = { ...keyMock1, used: true, moduleAddress: 'address2' };
        const duplicatedKeysAmongMultipleModules = [unusedKey, usedKey];

        const result = await service.getDuplicatedKeys(
          duplicatedKeysAmongMultipleModules,
          emptyBlockData,
        );

        expect(result.duplicates).toEqual([unusedKey]);
        expect(result.unresolved).toEqual([]);
      });

      describe('Detect duplicates based on SigningKeyAdded events', () => {
        it('Return all keys as unresolved if there are no event for operator', async () => {
          const unusedKey1 = {
            ...keyMock1,
            used: false,
            moduleAddress: 'address1',
          };
          const unusedKey2 = {
            ...keyMock1,
            used: false,
            moduleAddress: 'address2',
          };

          // unresolved will not influence detection of other keys duplicates
          const unusedKey3 = { ...keyMock2, used: false, operatorIndex: 1 };
          const usedKeys = { ...keyMock2, used: true, operatorIndex: 2 };

          const keyMock1Event = {
            ...eventMock1,
            moduleAddress: 'address1',
            logIndex: 1,
            blockNumber: 1,
          };

          mockSigningKeysRegistryService.getUpdatedSigningKeyEvents.mockImplementationOnce(
            async () => {
              return {
                events: [keyMock1Event],
                isValid: true,
              };
            },
          );

          const duplicatedKeysAmongMultipleModules = [
            unusedKey1,
            unusedKey2,
            unusedKey3,
            usedKeys,
          ];

          const result = await service.getDuplicatedKeys(
            duplicatedKeysAmongMultipleModules,
            emptyBlockData,
          );

          expect(result.duplicates).toEqual([unusedKey3]);
          expect(result.unresolved).toEqual([unusedKey1, unusedKey2]);
        });

        it('Returns all keys as duplicates if multiple events occur in the smallest block', async () => {
          const unusedKey1 = {
            ...keyMock1,
            used: false,
            moduleAddress: 'address1',
          };
          const unusedKey2 = {
            ...keyMock1,
            used: false,
            moduleAddress: 'address2',
          };

          const keyMock1Event = {
            ...eventMock1,
            moduleAddress: 'address1',
            logIndex: 1,
            blockNumber: 1,
          };

          const keyMock2Event = {
            ...eventMock1,
            moduleAddress: 'address2',
            logIndex: 2,
            blockNumber: 1,
          };

          mockSigningKeysRegistryService.getUpdatedSigningKeyEvents.mockImplementationOnce(
            async () => {
              return {
                events: [keyMock1Event, keyMock2Event],
                isValid: true,
              };
            },
          );

          const duplicatedKeysAmongMultipleModules = [unusedKey1, unusedKey2];

          const result = await service.getDuplicatedKeys(
            duplicatedKeysAmongMultipleModules,
            emptyBlockData,
          );

          expect(result.duplicates).toEqual([unusedKey1, unusedKey2]);
          expect(result.unresolved).toEqual([]);
        });

        it('Returns all keys as duplicates except the one with the smallest block number and key index', async () => {
          const unusedKey1 = {
            ...keyMock1,
            index: 1,
            used: false,
            moduleAddress: 'address1',
          };
          const unusedKey2 = {
            ...keyMock1,
            index: 2,
            used: false,
            moduleAddress: 'address1',
          };
          const unusedKey3 = {
            ...keyMock1,
            used: false,
            moduleAddress: 'address2',
          };

          const keyMock1Event = {
            ...eventMock1,
            moduleAddress: 'address1',
            logIndex: 1,
            blockNumber: 1,
          };

          const keyMock2Event = {
            ...eventMock1,
            moduleAddress: 'address2',
            logIndex: 1,
            blockNumber: 2,
          };

          mockSigningKeysRegistryService.getUpdatedSigningKeyEvents.mockImplementationOnce(
            async () => {
              return {
                events: [keyMock1Event, keyMock2Event],
                isValid: true,
              };
            },
          );

          const duplicatedKeysAmongMultipleModules = [
            unusedKey1,
            unusedKey2,
            unusedKey3,
          ];

          const result = await service.getDuplicatedKeys(
            duplicatedKeysAmongMultipleModules,
            emptyBlockData,
          );

          expect(result.duplicates).toEqual([unusedKey2, unusedKey3]);
          expect(result.unresolved).toEqual([]);
        });
      });
    });
  });
});
