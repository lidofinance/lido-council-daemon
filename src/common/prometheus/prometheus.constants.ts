export const METRICS_URL = 'metrics';
export const METRICS_PREFIX = 'council_daemon_';

export const METRIC_SENT_MESSAGES = `${METRICS_PREFIX}sent_messages_total`;
export const METRIC_PAUSE_ATTEMPTS = `${METRICS_PREFIX}pause_deposits_attempts_total`;

export const METRIC_RPC_REQUEST_DURATION = `${METRICS_PREFIX}rpc_requests_duration_seconds`;
export const METRIC_RPC_REQUEST_ERRORS = `${METRICS_PREFIX}rpc_requests_errors`;

export const METRIC_ACCOUNT_BALANCE = `${METRICS_PREFIX}account_balance`;

export const METRIC_BLOCK_DATA_REQUEST_DURATION = `${METRICS_PREFIX}block_data_requests_duration_seconds`;
export const METRIC_BLOCK_DATA_REQUEST_ERRORS = `${METRICS_PREFIX}block_data_requests_errors`;

export const METRIC_BUILD_INFO = `${METRICS_PREFIX}build_info`;

export const METRIC_VALIDATED_DEPOSITS_TOTAL = `${METRICS_PREFIX}validated_deposits_total`;
export const METRIC_INTERSECTIONS_TOTAL = `${METRICS_PREFIX}intersections_total`;

export const METRIC_DEPOSITED_KEYS_TOTAL = `${METRICS_PREFIX}deposited_keys_total`;
export const METRIC_OPERATORS_KEYS_TOTAL = `${METRICS_PREFIX}operators_keys_total`;

export const METRIC_KEYS_API_REQUEST_DURATION = `${METRICS_PREFIX}keys_api_requests_duration_seconds`;

export const METRIC_DUPLICATED_VETTED_UNUSED_KEYS_TOTAL = `${METRICS_PREFIX}duplicated_vetted_unused_keys`;

export const METRIC_INVALID_KEYS_TOTAL = `${METRICS_PREFIX}invalid_keys`;
