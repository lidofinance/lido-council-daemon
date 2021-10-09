export interface EnvironmentVariables {
  NODE_ENV: string;
  PORT: number;
  CORS_WHITELIST_REGEXP: string;
  GLOBAL_THROTTLE_TTL: number;
  GLOBAL_THROTTLE_LIMIT: number;
  GLOBAL_CACHE_TTL: number;
  SENTRY_DSN: string;
  LOG_LEVEL: string;
  LOG_FORMAT: string;
}
