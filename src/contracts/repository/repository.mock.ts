import { hexZeroPad } from '@ethersproject/bytes';
import { RepositoryService } from './repository.service';

export const mockRepository = async (repositoryService: RepositoryService) => {
  const address1 = '0x' + '5'.repeat(40);

  const depositAddr = jest
    .spyOn(repositoryService, 'getDepositAddress')
    .mockImplementation(async () => address1);

  const mockGetPauseMessagePrefix = jest
    .spyOn(repositoryService, 'getPauseMessagePrefix')
    .mockImplementation(async () => hexZeroPad('0x2', 32));

  const mockGetAttestMessagePrefix = jest
    .spyOn(repositoryService, 'getAttestMessagePrefix')
    .mockImplementation(async () => hexZeroPad('0x1', 32));

  await repositoryService.initCachedContracts('latest');
  jest.spyOn(repositoryService, 'getCachedLidoContract');

  return { depositAddr, mockGetPauseMessagePrefix, mockGetAttestMessagePrefix };
};
