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

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  await app.listen(appPort, '0.0.0.0');
}
bootstrap();
