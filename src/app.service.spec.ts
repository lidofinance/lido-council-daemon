import { APP_BRANCH, APP_COMMIT, APP_VERSION } from './app.constants';
import { AppService } from './app.service';

const createService = (Service: typeof AppService = AppService) => {
  const calls: string[] = [];
  const provider = {
    getNetwork: jest.fn(async () => {
      calls.push('getNetwork');
      return { chainId: 1, name: 'homestead' };
    }),
  };
  const logger = { log: jest.fn((message: string) => calls.push(message)) };
  const inc = jest.fn();
  const buildInfo = { labels: jest.fn().mockReturnValue({ inc }) };
  const service = new Service(
    provider as any,
    logger as any,
    buildInfo as any,
    { CHAIN_ID: 1 } as any,
  );
  return { service, calls, provider, buildInfo, inc };
};

describe('AppService', () => {
  it('dumps the config before it calls the RPC', async () => {
    const { service, calls } = createService();

    await service.onModuleInit();

    expect(calls).toEqual(['Config', 'getNetwork', 'Init app']);
  });

  it('sets build_info with the version, commit and branch', async () => {
    const { service, buildInfo, inc } = createService();

    await service.onModuleInit();

    expect(buildInfo.labels).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'lido-council-daemon',
        version: APP_VERSION,
        commit: APP_COMMIT,
        branch: APP_BRANCH,
        network: 'mainnet',
      }),
    );
    expect(inc).toHaveBeenCalledTimes(1);
  });

  it('stops before the RPC call when the version is longer than 31 bytes', async () => {
    let LongVersionAppService: typeof AppService = AppService;
    jest.isolateModules(() => {
      jest.doMock('app.constants', () => ({
        ...jest.requireActual('app.constants'),
        APP_VERSION: 'v'.repeat(32),
      }));
      LongVersionAppService =
        jest.requireActual<typeof import('./app.service')>(
          './app.service',
        ).AppService;
    });
    const { service, provider, calls } = createService(LongVersionAppService);

    await expect(service.onModuleInit()).rejects.toThrow(
      'is longer than 31 bytes',
    );
    expect(calls).toEqual(['Config']);
    expect(provider.getNetwork).not.toHaveBeenCalled();
  });
});
