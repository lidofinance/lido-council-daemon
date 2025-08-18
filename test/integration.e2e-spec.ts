import { TestingModule } from '@nestjs/testing';
import { setupTestingModule, initLevelDB } from './helpers/test-setup';
import { GuardianService } from 'guardian/guardian.service';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SecurityService } from 'contracts/security';
import { DepositsRegistryStoreService } from 'contracts/deposits-registry/store';
import { SigningKeysStoreService as SignKeyLevelDBService } from 'contracts/signing-keys-registry/store';
import { BlsService } from 'bls';
import { DataBusService } from 'contracts/data-bus';
import { TransportInterface } from 'transport';
import { HardhatServer } from './helpers/hardhat-server';
import {
  setupContainers,
  startContainerIfNotRunning,
} from './helpers/docker-containers/utils';
import { cutModulesKeys } from './helpers/reduce-keys';

jest.mock('../src/transport/stomp/stomp.client.ts');
jest.setTimeout(100_000);

describe('Integration Tests', () => {
  let moduleRef: TestingModule;
  let provider: SimpleFallbackJsonRpcBatchProvider;
  let keysApiService: KeysApiService;
  let guardianService: GuardianService;
  let securityService: SecurityService;
  let dataBusService: DataBusService;
  let transportInterface: TransportInterface;

  let levelDBService: DepositsRegistryStoreService;
  let signKeyLevelDBService: SignKeyLevelDBService;

  let postgresContainer;
  let keysApiContainer;
  let hardhatServer: HardhatServer;

  beforeAll(async () => {
    // Setup containers (postgres and keys-api)
    const { kapi, psql } = await setupContainers();
    keysApiContainer = kapi;
    postgresContainer = psql;

    await startContainerIfNotRunning(postgresContainer);

    // Start Hardhat node
    hardhatServer = new HardhatServer();
    await hardhatServer.start();

    console.log('Hardhat node is ready. Starting key cutting process...');
    await cutModulesKeys();

    await startContainerIfNotRunning(keysApiContainer);

    // Setup testing module
    moduleRef = await setupTestingModule();

    // Initialize LevelDB
    levelDBService = moduleRef.get(DepositsRegistryStoreService);
    signKeyLevelDBService = moduleRef.get(SignKeyLevelDBService);
    await initLevelDB(levelDBService, signKeyLevelDBService);

    // Initialize BLS service
    const blsService = moduleRef.get(BlsService);
    await blsService.onModuleInit();

    // Get services
    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    keysApiService = moduleRef.get(KeysApiService);
    guardianService = moduleRef.get(GuardianService);
    securityService = moduleRef.get(SecurityService);
    dataBusService = moduleRef.get(DataBusService);
    transportInterface = moduleRef.get(TransportInterface);
  }, 200_000);

  afterAll(async () => {
    await hardhatServer?.stop();
    await postgresContainer?.stop();
    await keysApiContainer?.stop();
    await moduleRef?.close();
  });

  describe('Infrastructure connectivity', () => {
    it('should connect to Hardhat node', async () => {
      const network = await provider.getNetwork();
      expect(network).toBeDefined();
      expect(network.chainId).toBeDefined();
    });

    it('should connect to Keys API', async () => {
      const status = await keysApiService.getKeysApiStatus();
      expect(status).toBeDefined();
    });

    it('should initialize all core services', () => {
      expect(guardianService).toBeDefined();
      expect(securityService).toBeDefined();
      expect(dataBusService).toBeDefined();
      expect(transportInterface).toBeDefined();
    });
  });

  describe('Data-bus provider connectivity after refactoring', () => {
    it('should have transport interface working', () => {
      expect(transportInterface).toBeDefined();
      expect(typeof transportInterface.publish).toBe('function');
    });

    it('should initialize data-bus service without errors', async () => {
      expect(dataBusService).toBeDefined();
      await expect(dataBusService.initialize()).resolves.not.toThrow();
    });

    it('should have guardian service with provider access', () => {
      expect(guardianService).toBeDefined();
      expect(typeof guardianService.handleNewBlock).toBe('function');
      expect(typeof guardianService.isNeedToProcessNewState).toBe('function');
    });
  });

  describe('Basic functionality', () => {
    it('should get modules from Keys API', async () => {
      const modules = await keysApiService.getModules();
      expect(modules).toBeDefined();
      expect(modules.data).toBeDefined();
      expect(Array.isArray(modules.data)).toBe(true);
    });

    it('should get current block number', async () => {
      const blockNumber = await provider.getBlockNumber();
      expect(typeof blockNumber).toBe('number');
      expect(blockNumber).toBeGreaterThan(0);
    });
  });
});
