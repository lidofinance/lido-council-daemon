export const RPC_METRICS_CONSTANTS = {
  RESPONSE_CODES: {
    SUCCESS: '2xx',
    CLIENT_ERROR: '4xx',
    SERVER_ERROR: '5xx',
  },
  RESULTS: {
    SUCCESS: 'success',
    FAIL: 'fail',
  },
  PROVIDERS: {
    UNKNOWN: 'unknown',
  },
} as const;

export const RPC_METRICS_CONFIG = 'RPC_METRICS_CONFIG';
