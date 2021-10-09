import { makeCounterProvider } from '@willsoto/nestjs-prometheus';

export const PrometheusQueryProvider = makeCounterProvider({
  name: 'http_query',
  help: 'HTTP query',
  labelNames: ['statusCode', 'method', 'pathname'] as const,
});
