import { ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { ConfigModule } from 'common/config';
import * as winston from 'winston';

export const LoggerModule = WinstonModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) => ({
    level: configService.get<string>('LOG_LEVEL'),
    transports: [
      new winston.transports.Console({
        format:
          configService.get<string>('LOG_FORMAT') === 'json'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
              ),
      }),
    ],
  }),
});
