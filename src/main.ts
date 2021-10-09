import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SWAGGER_URL } from 'common/swagger';
import { AppModule } from 'app.module';
import { APP_DESCRIPTION, APP_NAME, APP_VERSION } from 'app.constants';
import { VersioningType } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { TransportInterface } from './transport/transport.interface';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );

  const configService = app.get(ConfigService);
  const environment = configService.get<string>('NODE_ENV');
  const appPort = configService.get<number>('PORT');
  const corsWhitelist = configService.get<string>('CORS_WHITELIST_REGEXP');
  const sentryDsn = configService.get<string>('SENTRY_DSN');

  app.enableVersioning({ type: VersioningType.URI });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const transport = app.get(TransportInterface);

  await transport.subscribe('test', (msg) => {
    console.log(msg);
  });

  //await transport.publish('test', { hello: 'world' });

  const release = `${APP_NAME}@${APP_VERSION}`;

  Sentry.init({
    dsn: sentryDsn,
    release,
    environment,
  });

  if (corsWhitelist !== '') {
    const whitelistRegexp = new RegExp(corsWhitelist);

    app.enableCors({
      origin(origin, callback) {
        if (!origin || whitelistRegexp.test(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
    });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle(APP_DESCRIPTION)
    .setVersion(APP_VERSION)
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_URL, app, swaggerDocument);

  await app.listen(appPort, '0.0.0.0');
}
bootstrap();
