export const METRICS_URL = 'metrics';
export const METRICS_PREFIX = 'council_daemon_';

export const METRIC_SENT_MESSAGES = `${METRICS_PREFIX}sent_messages_total`;
export const METRIC_PAUSE_ATTEMPTS = `${METRICS_PREFIX}pause_deposits_attempts_total`;
export const METRIC_UNVET_ATTEMPTS = `${METRICS_PREFIX}unvet_attempts_total`;

export const METRIC_RPC_REQUEST_DURATION = `${METRICS_PREFIX}rpc_requests_duration_seconds`;
export const METRIC_RPC_REQUEST_ERRORS = `${METRICS_PREFIX}rpc_requests_errors`;

export const METRIC_ACCOUNT_BALANCE = `${METRICS_PREFIX}account_balance`;

export const METRIC_DATA_BUS_RPC_REQUEST_DURATION = `${METRICS_PREFIX}_data_bus_rpc_requests_duration_seconds`;
export const METRIC_DATA_BUS_RPC_REQUEST_ERRORS = `${METRICS_PREFIX}_data_bus_rpc_requests_errors`;

export const METRIC_DATA_BUS_ACCOUNT_BALANCE = `${METRICS_PREFIX}_data_bus_account_balance`;

export const METRIC_BLOCK_DATA_REQUEST_DURATION = `${METRICS_PREFIX}block_data_requests_duration_seconds`;
export const METRIC_BLOCK_DATA_REQUEST_ERRORS = `${METRICS_PREFIX}block_data_requests_errors`;

export const METRIC_BUILD_INFO = `${METRICS_PREFIX}build_info`;

export const METRIC_VALIDATED_DEPOSITS_TOTAL = `${METRICS_PREFIX}validated_deposits_total`;
export const METRIC_INTERSECTIONS_TOTAL = `${METRICS_PREFIX}intersections_total`;

export const METRIC_DEPOSITED_KEYS_TOTAL = `${METRICS_PREFIX}deposited_keys_total`;
export const METRIC_OPERATORS_KEYS_TOTAL = `${METRICS_PREFIX}operators_keys_total`;

export const METRIC_KEYS_API_REQUEST_DURATION = `${METRICS_PREFIX}keys_api_requests_duration_seconds`;

export const METRIC_DUPLICATED_KEYS_TOTAL = `${METRICS_PREFIX}duplicated_keys_total`;

export const METRIC_INVALID_KEYS_TOTAL = `${METRICS_PREFIX}invalid_keys_total`;

export const METRIC_HISTORICAL_FRONT_RUN_TOTAL = `${METRICS_PREFIX}historical_front_run_total`;

export const METRIC_JOB_DURATION = `${METRICS_PREFIX}handle_job_duration`;

// RPC Metrics
export const METRIC_HTTP_RPC_REQUESTS_TOTAL = `${METRICS_PREFIX}http_rpc_requests_total`;
export const METRIC_HTTP_RPC_BATCH_SIZE = `${METRICS_PREFIX}http_rpc_batch_size`;
export const METRIC_HTTP_RPC_RESPONSE_SECONDS = `${METRICS_PREFIX}http_rpc_response_seconds`;
export const METRIC_HTTP_RPC_REQUEST_PAYLOAD_BYTES = `${METRICS_PREFIX}http_rpc_request_payload_bytes`;
export const METRIC_HTTP_RPC_RESPONSE_PAYLOAD_BYTES = `${METRICS_PREFIX}http_rpc_response_payload_bytes`;
export const METRIC_RPC_REQUEST_TOTAL = `${METRICS_PREFIX}rpc_request_total`;

// Nonce Metrics
export const METRIC_NONCE_LATEST = `${METRICS_PREFIX}nonce_latest`;
export const METRIC_NONCE_PENDING = `${METRICS_PREFIX}nonce_pending`;
export const METRIC_NONCE_GAP = `${METRICS_PREFIX}nonce_gap`;

// Events Cache Metrics
export const METRIC_DEPOSITS_CACHE_BYTES = `${METRICS_PREFIX}deposits_cache_bytes`;
export const METRIC_DEPOSITS_CACHE_COUNT = `${METRICS_PREFIX}deposits_cache_count`;
export const METRIC_SIGNING_KEYS_CACHE_BYTES = `${METRICS_PREFIX}signing_keys_cache_bytes`;
export const METRIC_SIGNING_KEYS_CACHE_COUNT = `${METRICS_PREFIX}signing_keys_cache_count`;
