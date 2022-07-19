import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule, ProviderService } from 'provider';
import { LidoAbi__factory } from 'generated';
import { RepositoryModule } from 'contracts/repository';
import { Interface } from '@ethersproject/abi';
import { LidoService } from './lido.service';
import { LidoModule } from './lido.module';

describe('SecurityService', () => {
  let lidoService: LidoService;
  let providerService: ProviderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        LidoModule,
        RepositoryModule,
      ],
    }).compile();

    lidoService = moduleRef.get(LidoService);
    providerService = moduleRef.get(ProviderService);
  });

  describe('getWithdrawalCredentials', () => {
    it('should return withdrawal credentials', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(LidoAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getWithdrawalCredentials', result);
        });

      const wc = await lidoService.getWithdrawalCredentials();
      expect(wc).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });
});
