import { DynamicModule, Module } from '@nestjs/common';
import { TransportInterface } from './transport.interface';
import { ConfigService } from '@nestjs/config';
import { Transport } from './transport';
import { ConfigModule } from '../common/config';

@Module({})
export class TransportModule {
  static forRoot(): DynamicModule {
    return {
      module: TransportModule,
      global: true,
      providers: [
        {
          provide: TransportInterface,
          useFactory: async (configService: ConfigService) => {
            return new Transport(configService);
          },
          inject: [ConfigService],
        },
      ],
      imports: [ConfigModule],
      exports: [TransportInterface],
    };
  }
}
