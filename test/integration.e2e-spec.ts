import { TestingModule } from '@nestjs/testing';
import { Writable } from 'stream';
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
  getContainerLogs,
} from './helpers/docker-containers/utils';
import { cutModulesKeys } from './helpers/reduce-keys';
import { waitKAPIUpdateModulesKeys } from './helpers/kapi';
import { sleep } from 'utils';
import { getLocator } from './helpers/sr.contract';

jest.mock('../src/transport/stomp/stomp.client.ts');
jest.setTimeout(500_000);

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
    console.log('Step 1: Setting up containers...');
    const { kapi, psql } = await setupContainers();
    keysApiContainer = kapi;
    postgresContainer = psql;
    console.log('Step 1 completed: Containers setup finished');

    console.log('Step 2: Starting PostgreSQL container...');
    await startContainerIfNotRunning(postgresContainer);
    console.log('Step 2 completed: PostgreSQL container is running');

    // Start Hardhat node
    console.log('Step 3: Starting Hardhat node...');
    hardhatServer = new HardhatServer();
    await hardhatServer.start();
    console.log('Step 3 completed: Hardhat node is ready');

    console.log('Step 4: Starting key cutting process...');
    await cutModulesKeys();
    console.log('Step 4 completed: Key cutting process finished');

    console.log('Step 5: Starting Keys API container...');
    await startContainerIfNotRunning(keysApiContainer);
    console.log(
      'Step 5.1: Keys API container started, waiting for readiness...',
    );
    try {
      const logStream = await keysApiContainer.logs({
        stdout: true,
        stderr: true,
        tail: 50,
        follow: true,
      });


      const stdout = new Writable({
        write(chunk, encoding, callback) {
          console.log(
            `[Container ${keysApiContainer.id}]`,
            chunk.toString().trim(),
          );
          callback();
        },
      });

      const stderr = new Writable({
        write(chunk, encoding, callback) {
          console.error(
            `[Container ${keysApiContainer.id} ERROR]`,
            chunk.toString().trim(),
          );
          callback();
        },
      });

      keysApiContainer.modem.demuxStream(logStream, stdout, stderr);

      console.log(`Subscribed to container ${keysApiContainer.id} logs`);

      await waitKAPIUpdateModulesKeys();
      console.log('Step 5 completed: Keys API container is running and ready');
    } catch (error) {
      console.error(
        'Keys API readiness check failed, getting container logs...',
      );
      await getContainerLogs(keysApiContainer);
      throw error;
    }

    // Setup testing module
    console.log('Step 6: Setting up testing module...');
    moduleRef = await setupTestingModule();
    console.log('Step 6 completed: Testing module setup finished');

    // Initialize LevelDB
    console.log('Step 7: Initializing LevelDB...');
    console.log('Step 7.0.0: Testing provider connection first...');
    const testProvider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    try {
      const network = await testProvider.getNetwork();
      console.log(
        'Step 7.0.0 completed: Provider connection test successful, chainId:',
        network.chainId,
      );
      console.log(network);
    } catch (error) {
      console.error(
        'Step 7.0.0 failed: Provider connection test failed:',
        error,
      );
      throw error;
    }

    console.log('Step 7.0.1: Getting DepositsRegistryStoreService...');
    levelDBService = moduleRef.get(DepositsRegistryStoreService);
    console.log('Step 7.0.2: Getting SignKeyLevelDBService...');
    signKeyLevelDBService = moduleRef.get(SignKeyLevelDBService);
    console.log('Step 7.0.3: Both services obtained, calling initLevelDB...');
    await initLevelDB(levelDBService, signKeyLevelDBService);
    console.log('Step 7 completed: LevelDB initialization finished');

    // Initialize BLS service
    console.log('Step 8: Initializing BLS service...');
    const blsService = moduleRef.get(BlsService);
    await blsService.onModuleInit();
    console.log('Step 8 completed: BLS service initialization finished');

    // Get services
    console.log('Step 9: Getting services from module...');
    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    keysApiService = moduleRef.get(KeysApiService);
    guardianService = moduleRef.get(GuardianService);
    securityService = moduleRef.get(SecurityService);
    dataBusService = moduleRef.get(DataBusService);
    transportInterface = moduleRef.get(TransportInterface);
    console.log('Step 9 completed: All services obtained successfully');
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
      console.log('E2E_CHAIN_ID', network.chainId);
    });

    it('should connect to Keys API', async () => {
      const locator = await getLocator();
      const dsm = await locator.depositSecurityModule();
      console.log('LOCATOR', locator.address);
      console.log('E2E_DEPOSIT_SECURITY_MODULE', dsm);
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
