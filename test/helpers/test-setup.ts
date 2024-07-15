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

  // const providerService = moduleRef.get(ProviderService);
  // const walletService = moduleRef.get(WalletService);
  // const keysApiService = moduleRef.get(KeysApiService);
  // const guardianService = moduleRef.get(GuardianService);
  // const lidoService = moduleRef.get(LidoService);
  // const depositService = moduleRef.get(DepositService);
  // const guardianMessageService = moduleRef.get(GuardianMessageService);
  // const keyValidator = moduleRef.get(KeyValidatorInterface);
  // const securityService = moduleRef.get(SecurityService);
  // const stakingModuleGuardService = moduleRef.get(StakingModuleGuardService);
  // const levelDBService = moduleRef.get(LevelDBService);
  // const signKeyLevelDBService = moduleRef.get(SignKeyLevelDBService);
  // const depositIntegrityCheckerService = moduleRef.get(
  //   DepositIntegrityCheckerService,
  // );
  // const signingKeyEventsCacheService = moduleRef.get(
  //   SigningKeyEventsCacheService,
  // );
  // const repositoryService = moduleRef.get(RepositoryService);
  // const blsService = moduleRef.get(BlsService);
  // const stakingRouterService = moduleRef.get(StakingRouterService);

  // await blsService.onModuleInit();
  // await levelDBService.initialize();
  // await signKeyLevelDBService.initialize();

  // jest
  //   .spyOn(lidoService, 'getWithdrawalCredentials')
  //   .mockImplementation(async () => LIDO_WC);
  // jest
  //   .spyOn(guardianMessageService, 'pingMessageBroker')
  //   .mockImplementation(() => Promise.resolve());
  // jest
  //   .spyOn(depositIntegrityCheckerService, 'checkLatestRoot')
  //   .mockImplementation(() => Promise.resolve());
  // jest
  //   .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
  //   .mockImplementation(() => Promise.resolve());
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
