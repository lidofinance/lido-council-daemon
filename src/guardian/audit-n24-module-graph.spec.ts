// Audit focus N24-DI-1 (Node 24 dependency update): Nest 11 keys dynamic
// modules by reference, so a `register()` call evaluated twice yields two
// module instances with their own providers (two LevelDB handles, two worker
// pools, two schedulers). This test compiles the guardian module graph and
// reports every module class and provider class that exists more than once.
import { Test } from '@nestjs/testing';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { ConfigModule, Configuration } from 'common/config';
import { LoggerModule } from 'common/logger';
import { PrometheusModule } from 'common/prometheus';
import { RepositoryModule } from 'contracts/repository';
import { HealthModule } from 'health';
import { DATA_BUS_PROVIDER_TOKEN, MockProviderModule } from 'provider';
import { TransportInterface } from 'transport';
import { GuardianModule } from './guardian.module';

type Wrapper = { metatype?: unknown; instance?: unknown; name?: unknown };
type ModuleRefLike = {
  metatype: { name: string };
  providers: Map<unknown, Wrapper>;
};

describe('audit N24-DI-1: module and provider instances', () => {
  it('creates one instance of every module class and stateful provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        RepositoryModule,
        HealthModule,
        GuardianModule,
      ],
    })
      .overrideProvider(Configuration)
      .useValue({ LOG_LEVEL: 'error', LOG_FORMAT: 'json' })
      .overrideProvider(SimpleFallbackJsonRpcBatchProvider)
      .useValue({})
      .overrideProvider(DATA_BUS_PROVIDER_TOKEN)
      .useValue({})
      .overrideProvider(TransportInterface)
      .useValue({})
      .compile();

    try {
      const container = Reflect.get(moduleRef, 'container') as {
        getModules(): Map<string, ModuleRefLike>;
      };
      const modules = [...container.getModules().values()];

      // Count by class identity: two different classes may share a name.
      const moduleCounts = new Map<unknown, number>();
      for (const current of modules) {
        const key = current.metatype;
        moduleCounts.set(key, (moduleCounts.get(key) ?? 0) + 1);
      }
      const duplicatedModules = [...moduleCounts]
        .filter(([, count]) => count > 1)
        .map(([metatype, count]) => [
          (metatype as { name: string }).name,
          count,
        ]);

      // A class provider owned by more than one module instance.
      const instances = new Map<unknown, Set<unknown>>();
      for (const current of modules) {
        for (const wrapper of current.providers.values()) {
          const metatype = wrapper.metatype;
          const instance = wrapper.instance as object | null | undefined;
          if (typeof metatype !== 'function' || !instance) continue;
          // Nest registers each module class as a provider of itself.
          if (metatype === current.metatype) continue;
          if (typeof instance !== 'object') continue;
          if (instance.constructor !== metatype) continue;
          const seen = instances.get(metatype) ?? new Set();
          seen.add(instance);
          instances.set(metatype, seen);
        }
      }
      const duplicatedProviders = [...instances]
        .filter(([, seen]) => seen.size > 1)
        .map(([metatype, seen]) => [
          (metatype as { name: string }).name,
          seen.size,
        ]);

      console.log(
        JSON.stringify({
          modules: modules.length,
          duplicatedModules,
          duplicatedProviders,
        }),
      );

      // ConfigModule is imported as a global dynamic module and as an empty
      // static class; the static instance owns no providers.
      expect(
        duplicatedModules.filter(([name]) => name !== 'ConfigModule'),
      ).toEqual([]);
      // Nest framework classes exist once per module by design.
      const frameworkProviders = ['ModuleRef', 'ApplicationConfig'];
      expect(
        duplicatedProviders.filter(
          ([name]) => !frameworkProviders.includes(String(name)),
        ),
      ).toEqual([]);
    } finally {
      await moduleRef.close();
    }
  });
});
