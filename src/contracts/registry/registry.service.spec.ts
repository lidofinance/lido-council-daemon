import { Interface } from '@ethersproject/abi';
import { isAddress } from '@ethersproject/address';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { AddressZero } from '@ethersproject/constants';
import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { RegistryAbi__factory } from 'generated';
import { MockProviderModule, ProviderService } from 'provider';
import { SecurityService } from 'contracts/security';
import { DepositService } from 'contracts/deposit';
import { getNetwork } from '@ethersproject/networks';
import { PrometheusModule } from 'common/prometheus';
import { RegistryModule } from './registry.module';
import { RegistryService } from './registry.service';
import { CacheService } from 'cache';
import { NodeOperatorsCache } from './interfaces';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';

describe('RegistryService', () => {
  let providerService: ProviderService;
  let registryService: RegistryService;
  let securityService: SecurityService;
  let depositService: DepositService;
  let cacheService: CacheService<NodeOperatorsCache>;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        RegistryModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    registryService = moduleRef.get(RegistryService);
    securityService = moduleRef.get(SecurityService);
    depositService = moduleRef.get(DepositService);
    cacheService = moduleRef.get(CacheService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
  });

  describe('getContract', () => {
    it('should return contract instance', async () => {
      const contract = await registryService.getContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should cache instance', async () => {
      const contract1 = await registryService.getContract();
      const contract2 = await registryService.getContract();
      expect(contract1).toBe(contract2);
    });
  });

  describe('getCachedBatchContract', () => {
    it('should return contract instance', async () => {
      const contract = await registryService.getCachedBatchContract('key');
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should return cached instance if key is the same as previous', async () => {
      const contract1 = await registryService.getCachedBatchContract('foo');
      const contract2 = await registryService.getCachedBatchContract('foo');
      expect(contract1).toBe(contract2);
    });

    it('should return cached instance synchronously', async () => {
      const [contract1, contract2] = await Promise.all([
        registryService.getCachedBatchContract('foo'),
        registryService.getCachedBatchContract('foo'),
      ]);
      expect(contract1).toBe(contract2);
    });

    it('should return new instance if key is different', async () => {
      const contract1 = await registryService.getCachedBatchContract('foo');
      const contract2 = await registryService.getCachedBatchContract('bar');
      expect(contract1).not.toBe(contract2);
    });
  });

  describe('getPubkeyLength', () => {
    it('should return key length from contract', async () => {
      const expected = 10;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [BigNumber.from(expected).toHexString()];
          return iface.encodeFunctionResult('PUBKEY_LENGTH', result);
        });

      const prefix = await registryService.getPubkeyLength();
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getRegistryAddress', () => {
    it('should return contract address for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const address = await registryService.getRegistryAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });

    it('should return contract address for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const address = await registryService.getRegistryAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });
  });

  describe('getNextSigningKeys', () => {
    const lidoAddress = '0x' + '0'.repeat(40);
    const keyLength = 2;
    const pubkeys = '0x12345678';
    const expected = ['0x1234', '0x5678'];

    it('should return splitted pubkeys', async () => {
      jest
        .spyOn(securityService, 'getLidoContractAddress')
        .mockImplementation(async () => lidoAddress);

      jest
        .spyOn(securityService, 'getMaxDeposits')
        .mockImplementation(async () => 10);

      jest
        .spyOn(registryService, 'getPubkeyLength')
        .mockImplementation(async () => keyLength);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [pubkeys, '0x'];

          return iface.encodeFunctionResult('assignNextSigningKeys', result);
        });

      const result = await registryService.getNextSigningKeys();

      expect(result).toEqual(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getKeysOpIndex', () => {
    it('should return keys operation index', async () => {
      const expected = 10;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [BigNumber.from(expected).toHexString()];
          return iface.encodeFunctionResult('getKeysOpIndex', result);
        });

      const keysOpIndex = await registryService.getKeysOpIndex();
      expect(keysOpIndex).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getNodeOperatorsCount', () => {
    it('should return a number of node operators', async () => {
      const expected = 10;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [BigNumber.from(expected).toHexString()];
          return iface.encodeFunctionResult('getNodeOperatorsCount', result);
        });

      const operatorsTotal = await registryService.getNodeOperatorsCount();
      expect(operatorsTotal).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getNodeOperator', () => {
    it('should return node operator data', async () => {
      const operatorId = 10;

      const expected = {
        active: true,
        name: '',
        rewardAddress: '0x' + '0'.repeat(40),
        stakingLimit: 1,
        stoppedValidators: 2,
        totalSigningKeys: 3,
        usedSigningKeys: 4,
      };

      const mockGetCachedBatchContract = jest
        .spyOn(registryService, 'getCachedBatchContract')
        .mockImplementation(async () => registryService.getContract());

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = Object.values(expected);
          return iface.encodeFunctionResult('getNodeOperator', result);
        });

      const operatorData = await registryService.getNodeOperator(operatorId);
      expect(operatorData).toEqual({ ...expected, id: operatorId });
      expect(mockProviderCall).toBeCalledTimes(1);
      expect(mockGetCachedBatchContract).toBeCalledTimes(1);
    });
  });

  describe('getNodeOperatorsData', () => {
    it('should return node operators', async () => {
      const expectedOperatorsTotal = 2;
      const expectedOperatorData = {} as any;

      const mockGetNodeOperatorsCount = jest
        .spyOn(registryService, 'getNodeOperatorsCount')
        .mockImplementation(async () => expectedOperatorsTotal);

      const mockGetNodeOperator = jest
        .spyOn(registryService, 'getNodeOperator')
        .mockImplementation(async () => expectedOperatorData);

      const operatorsData = await registryService.getNodeOperatorsData();
      expect(operatorsData).toHaveLength(expectedOperatorsTotal);
      expect(mockGetNodeOperatorsCount).toBeCalledTimes(1);
      expect(mockGetNodeOperator).toBeCalledTimes(expectedOperatorsTotal);

      operatorsData.forEach((operatorData, index) => {
        expect(operatorData).toEqual({ id: index });
      });
    });
  });

  describe('getNodeOperatorKeys', () => {
    const operatorId = 10;
    const from = 7;
    const to = 10;
    const keysTotal = 10 - 7;
    const blockTag = 10;

    const signingKey = { key: '0x12', depositSignature: '0x23', used: false };

    it('should return node operator keys', async () => {
      const mockGetSigningKey = jest.fn().mockImplementation(() => signingKey);

      const mockGetCachedBatchContract = jest
        .spyOn(registryService, 'getCachedBatchContract')
        .mockImplementation(
          async () => ({ getSigningKey: mockGetSigningKey } as any),
        );

      const result = await registryService.getNodeOperatorKeys(
        operatorId,
        from,
        to,
        blockTag,
      );
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(keysTotal);
      expect(mockGetCachedBatchContract).toBeCalledTimes(keysTotal);

      const { calls } = mockGetSigningKey.mock;
      expect(mockGetSigningKey).toBeCalledTimes(keysTotal);
      expect(calls[0]).toEqual([operatorId, 7, { blockTag }]);
      expect(calls[1]).toEqual([operatorId, 8, { blockTag }]);
      expect(calls[2]).toEqual([operatorId, 9, { blockTag }]);
    });

    it('should call getCachedBatchContract with the same cacheKey', async () => {
      const mockGetSigningKey = jest.fn().mockImplementation(() => signingKey);

      const mockGetCachedBatchContract = jest
        .spyOn(registryService, 'getCachedBatchContract')
        .mockImplementation(
          async () => ({ getSigningKey: mockGetSigningKey } as any),
        );

      const result = await registryService.getNodeOperatorKeys(
        operatorId,
        from,
        to,
      );
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(keysTotal);

      const { calls } = mockGetCachedBatchContract.mock;
      expect(mockGetCachedBatchContract).toBeCalledTimes(keysTotal);
      expect(calls[0]).toEqual(calls[1]);
      expect(calls[0]).toEqual(calls[2]);
    });
  });

  describe('updateNodeOperatorsCache', () => {
    const firstOperator = {
      id: 0,
      rewardAddress: '0x1234',
      usedSigningKeys: 1,
      totalSigningKeys: 2,
    } as any;
    const firstOperatorKeys = [
      { used: true, key: '0x1' } as any,
      { used: false, key: '0x2' } as any,
    ];
    const firstOperatorWithKeys = {
      ...firstOperator,
      keys: firstOperatorKeys,
    };
    const secondOperator = {
      id: 1,
      rewardAddress: '0x2345',
      usedSigningKeys: 1,
      totalSigningKeys: 2,
    } as any;
    const secondOperatorKeys = [
      { used: true, key: '0x3' } as any,
      { used: false, key: '0x4' } as any,
    ];
    const secondOperatorWithKeys = {
      ...secondOperator,
      keys: secondOperatorKeys,
    };
    const currentBlock = 10;
    const depositRoot = '0x1234';
    const operators = [firstOperatorWithKeys, secondOperatorWithKeys];
    const nodeOperatorsCache = {
      keysOpIndex: 1,
      depositRoot,
      operators,
    };

    it('should update node operators cache if keysOpIndex is changed', async () => {
      const newKeysOpIndex = nodeOperatorsCache.keysOpIndex + 1;
      const newKeys = [{ used: false, key: '0x5' }];
      const newSecondOperator = { ...secondOperator, totalSigningKeys: 3 };
      const newSecondOperatorKeys = [...secondOperatorKeys, ...newKeys];
      const newSecondOperatorWithKeys = {
        ...newSecondOperator,
        keys: newSecondOperatorKeys,
      };

      const mockGetCachedNodeOperators = jest
        .spyOn(registryService, 'getCachedNodeOperators')
        .mockImplementation(async () => nodeOperatorsCache);

      const mockGetDepositRoot = jest
        .spyOn(depositService, 'getDepositRoot')
        .mockImplementation(async () => depositRoot);

      const mockGetKeysOpIndex = jest
        .spyOn(registryService, 'getKeysOpIndex')
        .mockImplementation(async () => newKeysOpIndex);

      const mockGetNodeOperatorsData = jest
        .spyOn(registryService, 'getNodeOperatorsData')
        .mockImplementation(async () => [firstOperator, newSecondOperator]);

      const mockGetNodeOperatorKeys = jest
        .spyOn(registryService, 'getNodeOperatorKeys')
        .mockImplementationOnce(async () => [firstOperatorKeys[1]])
        .mockImplementationOnce(async () => [
          newSecondOperatorKeys[1],
          newSecondOperatorKeys[2],
        ]);

      const mockSetCachedNodeOperatorsKeys = jest
        .spyOn(registryService, 'setCachedNodeOperatorsKeys')
        .mockImplementation(async () => undefined);

      await registryService.updateNodeOperatorsCache(currentBlock);

      expect(mockGetKeysOpIndex).toBeCalledTimes(1);
      expect(mockGetCachedNodeOperators).toBeCalledTimes(1);
      expect(mockGetNodeOperatorsData).toBeCalledTimes(1);
      expect(mockGetDepositRoot).toBeCalledTimes(1);

      const { calls } = mockGetNodeOperatorKeys.mock;
      expect(mockGetNodeOperatorKeys).toBeCalledTimes(2);
      expect(calls[0]).toEqual([firstOperator.id, 1, 2, currentBlock]);
      expect(calls[1]).toEqual([secondOperator.id, 1, 3, currentBlock]);

      expect(mockSetCachedNodeOperatorsKeys).toBeCalledTimes(1);
      expect(mockSetCachedNodeOperatorsKeys).toBeCalledWith({
        depositRoot,
        keysOpIndex: newKeysOpIndex,
        operators: [firstOperatorWithKeys, newSecondOperatorWithKeys],
      });
    });

    it('should update node operators cache if depositRoot is changed', async () => {
      const newDepositRoot = '0x9876';

      const mockGetCachedNodeOperators = jest
        .spyOn(registryService, 'getCachedNodeOperators')
        .mockImplementation(async () => nodeOperatorsCache);

      const mockGetDepositRoot = jest
        .spyOn(depositService, 'getDepositRoot')
        .mockImplementation(async () => newDepositRoot);

      const mockGetKeysOpIndex = jest
        .spyOn(registryService, 'getKeysOpIndex')
        .mockImplementation(async () => nodeOperatorsCache.keysOpIndex);

      const mockGetNodeOperatorsData = jest
        .spyOn(registryService, 'getNodeOperatorsData')
        .mockImplementation(async () => [firstOperator, secondOperator]);

      const mockGetNodeOperatorKeys = jest
        .spyOn(registryService, 'getNodeOperatorKeys')
        .mockImplementationOnce(async () => [firstOperatorKeys[1]])
        .mockImplementationOnce(async () => [secondOperatorKeys[1]]);

      const mockSetCachedNodeOperatorsKeys = jest
        .spyOn(registryService, 'setCachedNodeOperatorsKeys')
        .mockImplementation(async () => undefined);

      await registryService.updateNodeOperatorsCache(currentBlock);

      expect(mockGetKeysOpIndex).toBeCalledTimes(1);
      expect(mockGetCachedNodeOperators).toBeCalledTimes(1);
      expect(mockGetNodeOperatorsData).toBeCalledTimes(1);
      expect(mockGetDepositRoot).toBeCalledTimes(1);

      const { calls } = mockGetNodeOperatorKeys.mock;
      expect(mockGetNodeOperatorKeys).toBeCalledTimes(2);
      expect(calls[0]).toEqual([firstOperator.id, 1, 2, currentBlock]);
      expect(calls[1]).toEqual([secondOperator.id, 1, 2, currentBlock]);

      expect(mockSetCachedNodeOperatorsKeys).toBeCalledTimes(1);
      expect(mockSetCachedNodeOperatorsKeys).toBeCalledWith({
        depositRoot: newDepositRoot,
        keysOpIndex: nodeOperatorsCache.keysOpIndex,
        operators: [firstOperatorWithKeys, secondOperatorWithKeys],
      });
    });

    it('should exit if keysOpIndex and depositRoot is the same', async () => {
      const mockGetCachedNodeOperators = jest
        .spyOn(registryService, 'getCachedNodeOperators')
        .mockImplementation(async () => nodeOperatorsCache);

      const mockGetDepositRoot = jest
        .spyOn(depositService, 'getDepositRoot')
        .mockImplementation(async () => depositRoot);

      const mockGetKeysOpIndex = jest
        .spyOn(registryService, 'getKeysOpIndex')
        .mockImplementation(async () => nodeOperatorsCache.keysOpIndex);

      const mockGetNodeOperatorsData = jest
        .spyOn(registryService, 'getNodeOperatorsData')
        .mockImplementation(async () => []);

      const mockSetCachedNodeOperatorsKeys = jest
        .spyOn(registryService, 'setCachedNodeOperatorsKeys')
        .mockImplementation(async () => undefined);

      await registryService.updateNodeOperatorsCache();

      expect(mockGetKeysOpIndex).toBeCalledTimes(1);
      expect(mockGetCachedNodeOperators).toBeCalledTimes(1);
      expect(mockGetDepositRoot).toBeCalledTimes(1);
      expect(mockGetNodeOperatorsData).not.toBeCalled();
      expect(mockSetCachedNodeOperatorsKeys).not.toBeCalled();
    });

    it('should update all keys if operator is changed', async () => {
      const newKeysOpIndex = nodeOperatorsCache.keysOpIndex + 1;
      const newSecondOperator = { ...secondOperator, rewardAddress: '0x0987' };
      const newSecondOperatorWithKeys = {
        ...secondOperatorWithKeys,
        rewardAddress: '0x0987',
      };

      const mockGetCachedNodeOperators = jest
        .spyOn(registryService, 'getCachedNodeOperators')
        .mockImplementation(async () => nodeOperatorsCache);

      const mockGetDepositRoot = jest
        .spyOn(depositService, 'getDepositRoot')
        .mockImplementation(async () => depositRoot);

      const mockGetKeysOpIndex = jest
        .spyOn(registryService, 'getKeysOpIndex')
        .mockImplementation(async () => newKeysOpIndex);

      const mockGetNodeOperatorsData = jest
        .spyOn(registryService, 'getNodeOperatorsData')
        .mockImplementation(async () => [firstOperator, newSecondOperator]);

      const mockGetNodeOperatorKeys = jest
        .spyOn(registryService, 'getNodeOperatorKeys')
        .mockImplementationOnce(async () => [firstOperatorKeys[1]])
        .mockImplementationOnce(async () => secondOperatorKeys);

      const mockSetCachedNodeOperatorsKeys = jest
        .spyOn(registryService, 'setCachedNodeOperatorsKeys')
        .mockImplementation(async () => undefined);

      await registryService.updateNodeOperatorsCache(currentBlock);

      expect(mockGetKeysOpIndex).toBeCalledTimes(1);
      expect(mockGetCachedNodeOperators).toBeCalledTimes(1);
      expect(mockGetNodeOperatorsData).toBeCalledTimes(1);
      expect(mockGetDepositRoot).toBeCalledTimes(1);

      const { calls } = mockGetNodeOperatorKeys.mock;
      expect(mockGetNodeOperatorKeys).toBeCalledTimes(2);
      expect(calls[0]).toEqual([firstOperator.id, 1, 2, currentBlock]);
      expect(calls[1]).toEqual([secondOperator.id, 0, 2, currentBlock]);

      expect(mockSetCachedNodeOperatorsKeys).toBeCalledTimes(1);
      expect(mockSetCachedNodeOperatorsKeys).toBeCalledWith({
        keysOpIndex: newKeysOpIndex,
        depositRoot,
        operators: [firstOperatorWithKeys, newSecondOperatorWithKeys],
      });
    });
  });

  describe('getCachedNodeOperators', () => {
    it('should return events from cache', async () => {
      const nodeOperatorsCache = { keysOpIndex: 1, operators: [] } as any;

      const mockCache = jest
        .spyOn(cacheService, 'getCache')
        .mockImplementation(async () => nodeOperatorsCache);

      const result = await registryService.getCachedNodeOperators();

      expect(mockCache).toBeCalledTimes(1);
      expect(result).toEqual(nodeOperatorsCache);
    });
  });

  describe('setCachedNodeOperatorsKeys', () => {
    it('should call setCache from the cacheService', async () => {
      const nodeOperatorsCache = { keysOpIndex: 1, operators: [] } as any;

      const mockSetCache = jest
        .spyOn(cacheService, 'setCache')
        .mockImplementation(async () => undefined);

      await registryService.setCachedNodeOperatorsKeys(nodeOperatorsCache);

      expect(mockSetCache).toBeCalledTimes(1);
      expect(mockSetCache).toBeCalledWith(nodeOperatorsCache);
    });
  });
});
