import { Counter } from 'prom-client';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Request, Reply } from './interfaces';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(@InjectMetric('http_query') public counter: Counter<string>) {}

  use(request: Request, reply: Reply, next: () => void) {
    const { method, originalUrl, headers } = request;
    const { pathname } = new URL(originalUrl, `http://${headers.host}`);

    reply.on('finish', () => {
      const { statusCode } = reply;
      this.counter.labels({ statusCode, method, pathname }).inc();
    });

    next();
  }
}
