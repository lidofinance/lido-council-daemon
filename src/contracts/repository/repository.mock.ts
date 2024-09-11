import { RepositoryService } from './repository.service';

export const mockRepository = async (repositoryService: RepositoryService) => {
  const address1 = '0x' + '5'.repeat(40);

  const depositAddr = jest
    .spyOn(repositoryService, 'getDepositAddress')
    .mockImplementation(async () => address1);

  await repositoryService.initCachedContracts('latest');
  jest.spyOn(repositoryService, 'getCachedLidoContract');

  return {
    depositAddr,
  };
};
