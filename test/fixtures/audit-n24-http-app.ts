// Audit fixture (Node 24 dependency update): the daemon's HTTP layer alone.
// It creates the application the same way as src/main.ts, with the real
// health and metrics modules, and prints the listening port.
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AddressInfo } from 'node:net';
import { HealthModule } from 'health';
import { PrometheusModule } from 'common/prometheus';

@Module({ imports: [HealthModule, PrometheusModule] })
class AuditHttpModule {}

async function bootstrap() {
  const app = await NestFactory.create(AuditHttpModule, {
    bufferLogs: true,
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  process.stdout.write(`AUDIT_HTTP_PORT=${port}\n`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(70);
});
