import { CACHE_MANAGER, Inject } from '@nestjs/common';
import { CachingConfig, Cache as CacheManager } from 'cache-manager';

const cacheDefaultOptions = { max: 100, ttl: 300 };

export function Cache(options?: { key?: string } & Partial<CachingConfig>) {
  const injectCache = Inject(CACHE_MANAGER);

  const { key, ...cacheOptions } = options ?? {};

  return function (
    target: Record<string, any>,
    propertyKey: string,
    descriptor: PropertyDescriptor & { cacheManager?: CacheManager },
  ) {
    injectCache(target, 'cacheManager');
    const cacheKey = key || `${target.constructor.name}/${propertyKey}`;
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheManager = this.cacheManager as CacheManager;

      const cachedItem = (await cacheManager.get(cacheKey)) as any;
      if (cachedItem) return cachedItem;

      const result = await method.apply(this, args);
      await cacheManager.set(cacheKey, result, {
        ...cacheDefaultOptions,
        ...cacheOptions,
      });

      return result;
    };
  };
}
