import { Test } from '@nestjs/testing';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { ConfigModule, Configuration } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { DepositRegistryService } from 'contracts/deposits-registry';
import { DEPOSIT_REGISTRY_FINALIZED_TAG } from 'contracts/deposits-registry/deposits-registry.constants';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { RepositoryModule } from 'contracts/repository';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry';
import { SIGNING_KEYS_REGISTRY_FINALIZED_TAG } from 'contracts/signing-keys-registry/signing-keys-registry.constants';
import { SigningKeysStoreService } from 'contracts/signing-keys-registry/store';
import { DATA_BUS_PROVIDER_TOKEN, MockProviderModule } from 'provider';
import { TransportInterface } from 'transport';
import { BlockDataCollectorService } from './block-data-collector';
import { KeysDuplicationCheckerService } from './duplicates';
import { GuardianModule } from './guardian.module';
import { GuardianService } from './guardian.service';

describe('Guardian registry module ownership', () => {
  it.each(['finalized', 'latest'])(
    'shares the initialized registries and stores with block tag %s',
    async (blockTag) => {
      const builder = Test.createTestingModule({
        imports: [
          ConfigModule.forRoot(),
          MockProviderModule.forRoot(),
          LoggerModule,
          PrometheusModule,
          RepositoryModule,
          GuardianModule,
        ],
      })
        .overrideProvider(Configuration)
        .useValue({ LOG_LEVEL: 'error', LOG_FORMAT: 'json' })
        .overrideProvider(SimpleFallbackJsonRpcBatchProvider)
        .useValue({})
        .overrideProvider(DATA_BUS_PROVIDER_TOKEN)
        .useValue({})
        .overrideProvider(TransportInterface)
        .useValue({});

      if (blockTag === 'latest') {
        builder
          .overrideProvider(DEPOSIT_REGISTRY_FINALIZED_TAG)
          .useValue(blockTag)
          .overrideProvider(SIGNING_KEYS_REGISTRY_FINALIZED_TAG)
          .useValue(blockTag);
      }

      // Compile the real module graph, without starting jobs, opening databases
      // or contacting RPC nodes and message brokers.
      const moduleRef = await builder.compile();
      try {
        const guardian = moduleRef.get(GuardianService);
        const collector = moduleRef.get(BlockDataCollectorService);
        const duplicateChecker = moduleRef.get(KeysDuplicationCheckerService);
        const deposits = moduleRef.get(DepositRegistryService);
        const signingKeys = moduleRef.get(SigningKeysRegistryService);

        expect(Reflect.get(guardian, 'depositService')).toBe(deposits);
        expect(Reflect.get(collector, 'depositService')).toBe(deposits);
        expect(Reflect.get(guardian, 'signingKeysRegistryService')).toBe(
          signingKeys,
        );
        expect(
          Reflect.get(duplicateChecker, 'signingKeysRegistryService'),
        ).toBe(signingKeys);

        const depositStores = moduleRef.get(DepositsRegistryStoreService, {
          each: true,
        });
        const signingKeysStores = moduleRef.get(SigningKeysStoreService, {
          each: true,
        });
        expect(depositStores).toHaveLength(1);
        expect(signingKeysStores).toHaveLength(1);
        expect(Reflect.get(deposits, 'store')).toBe(depositStores[0]);
        expect(Reflect.get(signingKeys, 'store')).toBe(signingKeysStores[0]);
        expect(Reflect.get(deposits, 'finalizedTag')).toBe(blockTag);
        expect(Reflect.get(signingKeys, 'finalizedTag')).toBe(blockTag);
      } finally {
        await moduleRef.close();
      }
    },
  );
});
