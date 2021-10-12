import * as appRoot from 'app-root-path';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SWAGGER_URL } from 'common/swagger';
import { AppModule } from 'app.module';
import { APP_DESCRIPTION, APP_VERSION } from 'app.constants';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from './common/config/configuration';

dotenv.config({ path: resolve(appRoot.path, '.env'), debug: false });

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  const config = app.get<Configuration>(Configuration);
  const appPort = config.PORT;

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const swaggerConfig = new DocumentBuilder()
    .setTitle(APP_DESCRIPTION)
    .setVersion(APP_VERSION)
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_URL, app, swaggerDocument);

  await app.listen(appPort, '0.0.0.0');
}
bootstrap();
