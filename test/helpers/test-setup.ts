import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { DepositModule } from 'contracts/deposit';
import { LidoModule } from 'contracts/lido';
import { RepositoryModule } from 'contracts/repository';
import { SecurityModule } from 'contracts/security';
import { GuardianModule } from 'guardian';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { GanacheProviderModule } from 'provider';
import { WalletModule } from 'wallet';
import { LevelDBService } from 'contracts/deposit/leveldb';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';

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
      LidoModule,
      DepositModule,
      SecurityModule,
    ],
  }).compile();

  return moduleRef;
};

export const initLevelDB = async (
  levelDBService: LevelDBService,
  signKeyLevelDBService: SignKeyLevelDBService,
) => {
  await levelDBService.initialize();
  await signKeyLevelDBService.initialize();
};

export const closeServer = async (
  server,
  levelDBService: LevelDBService,
  signKeyLevelDBService: SignKeyLevelDBService,
) => {
  await server.close();
  await levelDBService.deleteCache();
  await signKeyLevelDBService.deleteCache();
  await levelDBService.close();
  await signKeyLevelDBService.close();
};

export const closeLevelDB = async (
  levelDBService: LevelDBService,
  signKeyLevelDBService: SignKeyLevelDBService,
) => {
  await levelDBService.deleteCache();
  await signKeyLevelDBService.deleteCache();
  await levelDBService.close();
  await signKeyLevelDBService.close();
};
