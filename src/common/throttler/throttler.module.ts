import { ConfigService } from '@nestjs/config';
import { ThrottlerModule as ThrottlerModuleSource } from '@nestjs/throttler';
import { ConfigModule } from 'common/config';

export const ThrottlerModule = ThrottlerModuleSource.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) => ({
    ttl: configService.get<number>('GLOBAL_THROTTLE_TTL'),
    limit: configService.get<number>('GLOBAL_THROTTLE_LIMIT'),
  }),
});
