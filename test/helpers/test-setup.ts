import { KeyValidatorInterface } from '@lido-nestjs/key-validation';
import {
  SECURITY_MODULE,
  SECURITY_MODULE_OWNER,
  GOOD_WC,
  GANACHE_PORT,
  NO_PRIVKEY_MESSAGE,
  CHAIN_ID,
  FORK_BLOCK,
  UNLOCKED_ACCOUNTS,
} from '../constants';
import { makeServer } from '../server';

import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { DepositModule, DepositService } from 'contracts/deposit';
import { LidoModule, LidoService } from 'contracts/lido';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { SecurityModule, SecurityService } from 'contracts/security';
import { ethers } from 'ethers';
import { SecurityAbi__factory } from 'generated';
import { GuardianModule, GuardianService } from 'guardian';
import { GuardianMessageService } from 'guardian/guardian-message';
import { KeysApiModule } from 'keys-api/keys-api.module';
import { KeysApiService } from 'keys-api/keys-api.service';
import { GanacheProviderModule, ProviderService } from 'provider';
import { WalletModule, WalletService } from 'wallet';
import { StakingModuleGuardService } from 'guardian/staking-module-guard';
import { BlsService } from 'bls';
import { LevelDBService } from 'contracts/deposit/leveldb';
import { LevelDBService as SignKeyLevelDBService } from 'contracts/signing-key-events-cache/leveldb';
import { DepositIntegrityCheckerService } from 'contracts/deposit/integrity-checker';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';

export const setupTestingModule = async () => {
  const server = makeServer(FORK_BLOCK, CHAIN_ID, UNLOCKED_ACCOUNTS);
  await server.listen(GANACHE_PORT);

  if (!process.env.WALLET_PRIVATE_KEY) throw new Error(NO_PRIVKEY_MESSAGE);

  const tempProvider = new ethers.providers.JsonRpcProvider(
    `http://127.0.0.1:${GANACHE_PORT}`,
  );
  const wallet = new ethers.Wallet(
    process.env.WALLET_PRIVATE_KEY,
    tempProvider,
  );

  await wallet.sendTransaction({
    to: SECURITY_MODULE_OWNER,
    value: ethers.utils.parseEther('2'),
  });

  const tempSigner = tempProvider.getSigner(SECURITY_MODULE_OWNER);

  const securityContract = SecurityAbi__factory.connect(
    SECURITY_MODULE,
    tempSigner,
  );
  await securityContract.functions.addGuardian(wallet.address, 1);

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

  const providerService = moduleRef.get(ProviderService);
  const walletService = moduleRef.get(WalletService);
  const keysApiService = moduleRef.get(KeysApiService);
  const guardianService = moduleRef.get(GuardianService);
  const lidoService = moduleRef.get(LidoService);
  const depositService = moduleRef.get(DepositService);
  const guardianMessageService = moduleRef.get(GuardianMessageService);
  const keyValidator = moduleRef.get(KeyValidatorInterface);
  const securityService = moduleRef.get(SecurityService);
  const stakingModuleGuardService = moduleRef.get(StakingModuleGuardService);
  const levelDBService = moduleRef.get(LevelDBService);
  const signKeyLevelDBService = moduleRef.get(SignKeyLevelDBService);
  const depositIntegrityCheckerService = moduleRef.get(
    DepositIntegrityCheckerService,
  );
  const signingKeyEventsCacheService = moduleRef.get(
    SigningKeyEventsCacheService,
  );
  const repositoryService = moduleRef.get(RepositoryService);

  const blsService = moduleRef.get(BlsService);
  await blsService.onModuleInit();

  await levelDBService.initialize();
  await signKeyLevelDBService.initialize();

  jest
    .spyOn(lidoService, 'getWithdrawalCredentials')
    .mockImplementation(async () => GOOD_WC);
  jest
    .spyOn(guardianMessageService, 'pingMessageBroker')
    .mockImplementation(() => Promise.resolve());

  jest
    .spyOn(depositIntegrityCheckerService, 'checkLatestRoot')
    .mockImplementation(() => Promise.resolve());
  jest
    .spyOn(depositIntegrityCheckerService, 'checkFinalizedRoot')
    .mockImplementation(() => Promise.resolve());

  return {
    server,
    providerService,
    walletService,
    keysApiService,
    guardianService,
    lidoService,
    depositService,
    blsService,
    guardianMessageService,
    keyValidator,
    securityService,
    stakingModuleGuardService,
    levelDBService,
    signKeyLevelDBService,
    signingKeyEventsCacheService,
    repositoryService,
  };
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
