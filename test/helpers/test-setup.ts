import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { DepositsRegistryModule } from 'contracts/deposits-registry';
import { RepositoryModule } from 'contracts/repository';
import { SecurityModule } from 'contracts/security';
import { GuardianModule } from 'guardian';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { WalletModule } from 'wallet';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TestProviderModule } from 'provider';
import { CHAIN_ID } from './config';

export const setupTestingModule = async () => {
  process.env.EVM_CHAIN_DATA_BUS_PROVIDER_URL = 'http://127.0.0.1:8545';
  process.env.EVM_CHAIN_DATA_BUS_CHAIN_ID = String(CHAIN_ID);

  const moduleRef = await Test.createTestingModule({
    imports: [
      TestProviderModule.forRoot(),
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
  console.log(
    'Step 7.1: Starting DepositsRegistryStoreService.initialize()...',
  );
  await levelDBService.initialize();
  console.log('Step 7.1 completed: DepositsRegistryStoreService initialized');

  console.log('Step 7.2: Starting SignKeyLevelDBService.initialize()...');
  await signKeyLevelDBService.initialize();
  console.log('Step 7.2 completed: SignKeyLevelDBService initialized');
};
