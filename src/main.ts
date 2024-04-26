import { NestFactory } from '@nestjs/core';
import { Configuration } from 'common/config';
import { AppModule } from 'app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get<Configuration>(Configuration);
  const appPort = config.PORT;

  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  process.on('unhandledRejection', async (error) => {
    logger.log('Unhandled rejection');
    logger.error(error);

    await app.close();
    process.exit(1);
  });

  await app.listen(appPort, '0.0.0.0');
}
bootstrap();
