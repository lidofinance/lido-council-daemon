import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { DepositsRegistryModule } from 'contracts/deposits-registry';
import { RepositoryModule } from 'contracts/repository';
import { SecurityModule } from 'contracts/security';
import { GuardianModule } from 'guardian';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { GanacheProviderModule } from 'provider';
import { WalletModule } from 'wallet';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

export const setupTestingModule = async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      GanacheProviderModule.forRoot(),
      ConfigModule.forRoot(),
      PrometheusModule,
      LoggerModule,
      GuardianModule,
      RepositoryModule,
      WalletModule,
      KeysApiModule,
      DepositsRegistryModule.register('latest'),
      SecurityModule,
    ],
  }).compile();

  const loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

  jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
  jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
  jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  jest.spyOn(loggerService, 'error').mockImplementation(() => undefined);

  return moduleRef;
};

export const initLevelDB = async (
  levelDBService: DepositsRegistryStoreService,
  signKeyLevelDBService: SignKeyLevelDBService,
) => {
  await levelDBService.initialize();
  await signKeyLevelDBService.initialize();
};

export const closeServer = async (
  server,
  levelDBService: DepositsRegistryStoreService,
  signKeyLevelDBService: SignKeyLevelDBService,
) => {
  await server.close();
  await levelDBService.deleteCache();
  await signKeyLevelDBService.deleteCache();
  await levelDBService.close();
  await signKeyLevelDBService.close();
};

export const closeLevelDB = async (
  levelDBService: DepositsRegistryStoreService,
  signKeyLevelDBService: SignKeyLevelDBService,
) => {
  await levelDBService.deleteCache();
  await signKeyLevelDBService.deleteCache();
  await levelDBService.close();
  await signKeyLevelDBService.close();
};
