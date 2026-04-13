import { DynamicModule, Module, Provider } from '@nestjs/common';
import { RpcMetricsService, RPC_METRICS_REGISTRY } from './rpc-metrics.service';
import { RPC_METRICS_CONFIG } from './rpc-metrics.constants';
import {
  RpcMetricsModuleOptions,
  RpcMetricsModuleAsyncOptions,
} from './interfaces/rpc-metrics.interface';
import { RpcMetricsRegistry } from './interfaces/prometheus-metrics.interface';

@Module({})
export class RpcMetricsModule {
  /**
   * Register the RPC metrics module with static configuration
   *
   * @example
   * ```typescript
   * RpcMetricsModule.forRoot({
   *   providers: [{
   *     network: 'ethereum',
   *     chainId: 1,
   *     layer: 'el',
   *     providerFactory: () => myProvider,
   *   }],
   * }, prometheusService)
   * ```
   */
  static forRoot(
    options: RpcMetricsModuleOptions,
    metricsRegistry: RpcMetricsRegistry,
  ): DynamicModule {
    return {
      module: RpcMetricsModule,
      providers: [
        {
          provide: RPC_METRICS_CONFIG,
          useValue: options,
        },
        {
          provide: RPC_METRICS_REGISTRY,
          useValue: metricsRegistry,
        },
        RpcMetricsService,
      ],
      exports: [RpcMetricsService],
    };
  }

  /**
   * Register the RPC metrics module with async configuration
   *
   * @example
   * ```typescript
   * RpcMetricsModule.forRootAsync({
   *   imports: [ConfigModule, ProviderModule],
   *   useFactory: (configService, providerService) => ({
   *     providers: [{
   *       network: configService.get('NETWORK'),
   *       chainId: configService.get('CHAIN_ID'),
   *       layer: 'el',
   *       providerFactory: () => providerService.getProvider(),
   *     }],
   *   }),
   *   inject: [ConfigService, ProviderService],
   * }, {
   *   useExisting: PrometheusService,
   * })
   * ```
   */
  static forRootAsync(
    options: RpcMetricsModuleAsyncOptions,
    metricsRegistryProvider: MetricsRegistryProvider,
  ): DynamicModule {
    const configProvider: Provider = {
      provide: RPC_METRICS_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    const registryProvider = this.createMetricsRegistryProvider(
      metricsRegistryProvider,
    );

    return {
      module: RpcMetricsModule,
      imports: options.imports || [],
      providers: [configProvider, registryProvider, RpcMetricsService],
      exports: [RpcMetricsService],
    };
  }

  private static createMetricsRegistryProvider(
    provider: MetricsRegistryProvider,
  ): Provider {
    if ('useExisting' in provider) {
      return {
        provide: RPC_METRICS_REGISTRY,
        useExisting: provider.useExisting,
      };
    }
    if ('useClass' in provider) {
      return {
        provide: RPC_METRICS_REGISTRY,
        useClass: provider.useClass,
      };
    }
    if ('useFactory' in provider) {
      return {
        provide: RPC_METRICS_REGISTRY,
        useFactory: provider.useFactory,
        inject: provider.inject || [],
      };
    }
    if ('useValue' in provider) {
      return {
        provide: RPC_METRICS_REGISTRY,
        useValue: provider.useValue,
      };
    }
    throw new Error('Invalid metrics registry provider configuration');
  }
}

export type MetricsRegistryProvider =
  | { useExisting: any }
  | { useClass: any }
  | {
      useFactory: (
        ...args: any[]
      ) => RpcMetricsRegistry | Promise<RpcMetricsRegistry>;
      inject?: any[];
    }
  | { useValue: RpcMetricsRegistry };
