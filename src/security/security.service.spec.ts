import { isAddress } from '@ethersproject/address';
import { Contract } from '@ethersproject/contracts';
import { AddressZero } from '@ethersproject/constants';
import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { ProviderModule, ProviderService } from 'provider';
import { WalletModule, WalletService } from 'wallet';
import { SecurityService } from './security.service';
import { SecurityAbi__factory } from 'generated';
import { Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { hexZeroPad } from '@ethersproject/bytes';
import { Wallet } from '@ethersproject/wallet';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';

describe('SecurityService', () => {
  const address1 = hexZeroPad('0x1', 20);
  const address2 = hexZeroPad('0x2', 20);
  const address3 = hexZeroPad('0x3', 20);

  let securityService: SecurityService;
  let providerService: ProviderService;
  let walletService: WalletService;
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
        WalletModule,
      ],
      providers: [SecurityService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    securityService = moduleRef.get(SecurityService);
    providerService = moduleRef.get(ProviderService);
    walletService = moduleRef.get(WalletService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
  });

  describe('getContract', () => {
    it('should return contract instance', async () => {
      const contract = await securityService.getContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should cache instance', async () => {
      const contract1 = await securityService.getContract();
      const contract2 = await securityService.getContract();
      expect(contract1).toBe(contract2);
    });
  });

  describe('getContractWithSigner', () => {
    it('should return contract instance', async () => {
      const contract = await securityService.getContractWithSigner();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should cache instance', async () => {
      const contract1 = await securityService.getContractWithSigner();
      const contract2 = await securityService.getContractWithSigner();
      expect(contract1).toBe(contract2);
    });

    it('should have signer', async () => {
      const contract = await securityService.getContractWithSigner();
      expect(contract.signer).toBeInstanceOf(Wallet);
    });
  });

  describe('getDepositSecurityAddress', () => {
    it('should return contract address for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const address = await securityService.getDepositSecurityAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });

    it.skip('should return contract address for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const address = await securityService.getDepositSecurityAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });
  });

  describe('getAttestMessagePrefix', () => {
    it('should return message prefix', async () => {
      const expected = '0x' + '1'.repeat(64);

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('ATTEST_MESSAGE_PREFIX', result);
        });

      const prefix = await securityService.getAttestMessagePrefix();
      expect(prefix).toBe(expected);
      expect(providerCall).toBeCalledTimes(1);
    });
  });

  describe('getPauseMessagePrefix', () => {
    it('should return message prefix', async () => {
      const expected = '0x' + '1'.repeat(64);

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('PAUSE_MESSAGE_PREFIX', result);
        });

      const prefix = await securityService.getPauseMessagePrefix();
      expect(prefix).toBe(expected);
      expect(providerCall).toBeCalledTimes(1);
    });
  });

  describe('getMaxDeposits', () => {
    it('should return max deposits', async () => {
      const expected = 10;

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [BigNumber.from(expected).toHexString()];
          return iface.encodeFunctionResult('getMaxDeposits', result);
        });

      const maxDeposits = await securityService.getMaxDeposits();
      expect(typeof maxDeposits).toBe('number');
      expect(maxDeposits).toBe(expected);
      expect(providerCall).toBeCalledTimes(1);
    });
  });

  describe('getGuardians', () => {
    it('should return guardians', async () => {
      const expected = [address1, address2];

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(SecurityAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getGuardians', result);
        });

      const guardians = await securityService.getGuardians();
      expect(guardians).toEqual(expected);
      expect(providerCall).toBeCalledTimes(1);
    });
  });

  describe('getGuardianIndex', () => {
    beforeEach(() => {
      const guardians = [address1, address2];

      jest
        .spyOn(securityService, 'getGuardians')
        .mockImplementation(async () => guardians);
    });

    it('should return guardian index', async () => {
      jest
        .spyOn(walletService, 'address', 'get')
        .mockImplementation(() => address1);

      const guardianIndex = await securityService.getGuardianIndex();
      expect(guardianIndex).toEqual(0);
    });

    it('should return -1 if address is not in the list', async () => {
      jest
        .spyOn(walletService, 'address', 'get')
        .mockImplementation(() => address3);

      const guardianIndex = await securityService.getGuardianIndex();
      expect(guardianIndex).toBe(-1);
    });
  });

  describe('signDepositData', () => {
    it('should add prefix', async () => {
      const prefix = '0x0001';
      const depositRoot = '0x0002';
      const keysOpIndex = 1;
      const blockNumber = 1;
      const blockHash = '0x0003';
      const args = [depositRoot, keysOpIndex, blockNumber, blockHash] as const;

      const getAttestMessagePrefix = jest
        .spyOn(securityService, 'getAttestMessagePrefix')
        .mockImplementation(async () => prefix);

      const signDepositData = jest.spyOn(walletService, 'signDepositData');

      const result = await securityService.signDepositData(...args);
      expect(getAttestMessagePrefix).toBeCalledTimes(1);
      expect(signDepositData).toBeCalledWith(prefix, ...args);
      expect(result.length).toBe(132);
    });
  });

  describe('signPauseData', () => {
    it('should add prefix', async () => {
      const prefix = '0x0001';
      const blockNumber = 1;
      const blockHash = '0x0002';
      const args = [blockNumber, blockHash] as const;

      const getPauseMessagePrefix = jest
        .spyOn(securityService, 'getPauseMessagePrefix')
        .mockImplementation(async () => prefix);

      const signPauseData = jest.spyOn(walletService, 'signPauseData');

      const result = await securityService.signPauseData(...args);
      expect(getPauseMessagePrefix).toBeCalledTimes(1);
      expect(signPauseData).toBeCalledWith(prefix, ...args);
      expect(result.length).toBe(132);
    });
  });

  describe('pauseDeposits', () => {
    const isPaused = jest.fn();
    const pauseDeposits = jest.fn();

    const blockNumber = 10;
    const blockHash = hexZeroPad('0x01', 32);
    let signature: string;

    beforeEach(async () => {
      jest
        .spyOn(providerService, 'getBlock')
        .mockImplementation(
          async () => ({ number: blockNumber, hash: blockHash } as any),
        );

      jest
        .spyOn(securityService, 'getGuardianIndex')
        .mockImplementation(async () => 0);

      jest
        .spyOn(securityService, 'getPauseMessagePrefix')
        .mockImplementation(async () => '0x' + '1'.repeat(64));

      jest
        .spyOn(securityService, 'getContractWithSigner')
        .mockImplementation(async () => ({ isPaused, pauseDeposits } as any));

      const data = await securityService.getPauseDepositData();
      signature = data.signature;
    });

    afterEach(async () => {
      isPaused.mockClear();
      pauseDeposits.mockClear();
    });

    it('should call contract method', async () => {
      const wait = jest.fn();
      const hash = '0x1234';
      const expected = {};

      isPaused.mockImplementation(async () => false);
      pauseDeposits.mockImplementation(async () => ({ wait, hash }));
      wait.mockImplementation(async () => expected);

      const result = await securityService.pauseDeposits(
        blockNumber,
        blockHash,
        signature,
      );

      expect(result).toBe(expected);
      expect(isPaused).toBeCalledTimes(1);
      expect(pauseDeposits).toBeCalledTimes(1);
      expect(wait).toBeCalledTimes(1);
    });

    it('should not call pause if contract is already paused', async () => {
      isPaused.mockImplementation(async () => true);
      pauseDeposits.mockImplementation(async () => null);

      await securityService.pauseDeposits(blockNumber, blockHash, signature);

      expect(isPaused).toBeCalledTimes(1);
      expect(pauseDeposits).toBeCalledTimes(0);
    });
  });
});
