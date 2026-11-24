import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import http = require('node:http');
import { AddressInfo } from 'node:net';
import { HealthModule } from './health.module';
import { markReady } from './readiness';

const get = (port: number, path: string): Promise<number | undefined> =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, agent: false }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      })
      .on('error', reject);
  });

describe('ReadyController', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 before the start finishes and 200 after it', async () => {
    expect(await get(port, '/ready')).toBe(503);
    expect(await get(port, '/health')).toBe(200);

    markReady();

    expect(await get(port, '/ready')).toBe(200);
    expect(await get(port, '/health')).toBe(200);
  });
});
