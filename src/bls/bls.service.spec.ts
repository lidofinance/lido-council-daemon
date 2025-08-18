import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { getNetwork } from '@ethersproject/networks';
import { MockProviderModule } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { RepositoryModule } from 'contracts/repository';
import { BlsModule } from './bls.module';
import { BlsService } from './bls.service';
import { PrometheusModule } from 'common/prometheus';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';

describe('BlsService', () => {
  let provider: SimpleFallbackJsonRpcBatchProvider;
  let blsService: BlsService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        BlsModule,
        PrometheusModule,
        LoggerModule,
        RepositoryModule,
      ],
    }).compile();

    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    blsService = moduleRef.get(BlsService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);

    jest
      .spyOn(provider, 'detectNetwork')
      .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

    jest.spyOn(provider, 'getNetwork').mockImplementation(async () => ({
      chainId: CHAINS.Mainnet,
      name: 'mainnet',
    }));

    await blsService.onModuleInit();
  });

  describe('valid signature', () => {
    it('should return true on valid 1 eth deposit', async () => {
      // https://beaconcha.in/validator/0x933ad9491b62059dd065b560d256d8957a8c402cc6e8d8ee7290ae11e8f7329267a8811c397529dac52ae1342ba58c95#deposits
      expect(
        blsService.verify({
          pubkey:
            '0x933ad9491b62059dd065b560d256d8957a8c402cc6e8d8ee7290ae11e8f7329267a8811c397529dac52ae1342ba58c95',
          wc: '0x00f50428677c60f997aadeab24aabf7fceaef491c96a52b463ae91f95611cf71',
          amount: '0x00ca9a3b00000000',
          signature:
            '0xa29d01cc8c6296a8150e515b5995390ef841dc18948aa3e79be6d7c1851b4cbb5d6ff49fa70b9c782399506a22a85193151b9b691245cebafd2063012443c1324b6c36debaedefb7b2d71b0503ffdc00150aaffd42e63358238ec888901738b8',
        }),
      ).toBeTruthy();
    });

    it('should return true on valid 32 eth deposit', async () => {
      // https://beaconcha.in/validator/0x98b7d0eac7ab95d34dbf2b7baa39a8ec451671328c063ab1207c2055d9d5d6f1115403dc5ea19a1111a404823bd9a6e9#deposits
      expect(
        blsService.verify({
          pubkey:
            '0x98b7d0eac7ab95d34dbf2b7baa39a8ec451671328c063ab1207c2055d9d5d6f1115403dc5ea19a1111a404823bd9a6e9',
          wc: '0x00b687cc6db1ea059b1796f445d8bdc5f7178cfde52f159595484e779c0f78f0',
          amount: '0x0040597307000000',
          signature:
            '0xb2b0937edd6be086944ce1e6db99e604b5947f86dd27f13e22b98269eb2c93d7ffda9664d6045ab7ec41c39fc846c84b030608691ae3efb3e3e4aafe3c299a0f60a1a4403a67cba5997a01a1af359f08f148358773e23d90e7a09c6690aafa05',
        }),
      ).toBeTruthy();
    });
  });

  describe('invalid signature', () => {
    it('should return false on invalid signature', async () => {
      expect(
        blsService.verify({
          pubkey:
            '0x933ad9491b62059dd065b560d256d8957a8c402cc6e8d8ee7290ae11e8f7329267a8811c397529dac52ae1342ba58c95',
          wc: '0x00f50428677c60f997aadeab24aabf7fceaef491c96a52b463ae91f95611cf71',
          amount: '0x00ca9a3b00000000',
          signature:
            '0xb2b0937edd6be086944ce1e6db99e604b5947f86dd27f13e22b98269eb2c93d7ffda9664d6045ab7ec41c39fc846c84b030608691ae3efb3e3e4aafe3c299a0f60a1a4403a67cba5997a01a1af359f08f148358773e23d90e7a09c6690aafa05',
        }),
      ).toBeFalsy();

      expect(
        blsService.verify({
          pubkey:
            '0x98b7d0eac7ab95d34dbf2b7baa39a8ec451671328c063ab1207c2055d9d5d6f1115403dc5ea19a1111a404823bd9a6e9',
          wc: '0x00b687cc6db1ea059b1796f445d8bdc5f7178cfde52f159595484e779c0f78f0',
          amount: '0x0040597307000000',
          signature:
            '0xa29d01cc8c6296a8150e515b5995390ef841dc18948aa3e79be6d7c1851b4cbb5d6ff49fa70b9c782399506a22a85193151b9b691245cebafd2063012443c1324b6c36debaedefb7b2d71b0503ffdc00150aaffd42e63358238ec888901738b8',
        }),
      ).toBeFalsy();
    });
  });
});
