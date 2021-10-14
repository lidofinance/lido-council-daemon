import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { ProviderModule, ProviderService } from 'provider';
import { DefenderService } from './defender.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { TransportInterface, TransportModule } from 'transport';
import { RegistryModule, RegistryService } from 'registry';
import { DepositModule } from 'deposit';
import { SecurityModule } from 'security';

describe('DefenderService', () => {
  let providerService: ProviderService;
  let depositService: DefenderService;
  let registryService: RegistryModule;
  let transportService: TransportInterface;
  let loggerService: LoggerService;

  beforeEach(async () => {
    class MockRpcProvider extends JsonRpcProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        LoggerModule,
        ProviderModule,
        RegistryModule,
        DepositModule,
        SecurityModule,
        TransportModule,
      ],
      providers: [DefenderService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    providerService = moduleRef.get(ProviderService);
    depositService = moduleRef.get(DefenderService);
    registryService = moduleRef.get(RegistryService);
    transportService = moduleRef.get(TransportInterface);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
  });

  describe('initialize', () => {
    it.todo('should init deposit service');
    it.todo('should subscribe to updates');
  });

  describe('subscribeToEthereumUpdates', () => {
    it.todo('should subscribe to updates');
  });

  describe('matchPubKeys', () => {
    it.todo('should find the keys when they match');
    it.todo('should not find the keys when they don’t match');
    it.todo('should work if array is empty');
  });

  describe('isSameState', () => {
    it.todo('should return false if previous state is empty');
    it.todo('should return true if state is the same');
    it.todo('should return false if actualStateIndex is changed');
    it.todo('should return false if keysOpIndex is changed');
    it.todo('should return false if depositRoot is changed');
  });

  describe('protectPubKeys', () => {
    it.todo(
      'should call handleSuspiciousCase if Lido unused key is found in the deposit contract',
    );
    it.todo(
      'should call handleCorrectCase if Lido unused key are not found in the deposit contract',
    );
  });

  describe('getMessageTopic', () => {
    it.todo('should return topic for mainnet');
    it.todo('should return topic for goerli');
    it.todo('should return different topics');
  });

  describe('sendMessage', () => {
    it.todo('should send message to transport service');
  });

  describe('handleCorrectCase', () => {
    it.todo('should collect deposit data');
    it.todo('should send message');
  });

  describe('handleSuspiciousCase', () => {
    it.todo('should collect pause deposits data');
    it.todo('should send message');
    it.todo('should pause deposits');
  });
});
