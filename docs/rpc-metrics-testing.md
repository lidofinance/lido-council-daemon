# RPC Metrics Testing Guide

This guide explains how to test the new RPC metrics locally using Prometheus and Grafana.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and Yarn installed
- Valid `.env` configuration

## Quick Start

### 1. Start Prometheus and Grafana

```bash
docker-compose -f docker-compose.metrics.yml up -d
```

This starts:
- **Prometheus** on http://localhost:9090
- **Grafana** on http://localhost:8001 (login: admin/admin)

### 2. Start the Application

```bash
yarn start:dev
```

The application exposes metrics on `http://localhost:3004/metrics`.

### 3. Verify Metrics

Run the verification script:

```bash
./scripts/check-rpc-metrics.sh
```

Or manually check:

```bash
curl -s http://localhost:3004/metrics | grep council_daemon_http_rpc
```

## New RPC Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `council_daemon_http_rpc_requests_total` | Counter | Total HTTP requests to RPC providers |
| `council_daemon_http_rpc_batch_size` | Histogram | Number of JSON-RPC calls per HTTP request |
| `council_daemon_http_rpc_response_seconds` | Histogram | RPC response time distribution |
| `council_daemon_http_rpc_request_payload_bytes` | Histogram | Request payload size |
| `council_daemon_http_rpc_response_payload_bytes` | Histogram | Response payload size |
| `council_daemon_rpc_request_total` | Counter | Individual RPC method calls |

### Labels

All metrics include these labels:
- `network` - Network identifier (`ethereum` or `data-bus`)
- `layer` - Layer type (`el` for execution layer)
- `chain_id` - Chain ID
- `provider` - RPC provider domain (normalized)

Additional labels per metric:
- `http_rpc_requests_total`: `batched`, `response_code`, `result`
- `rpc_request_total`: `method`, `result`, `rpc_error_code`

## PromQL Queries

### Request Rate by Network

```promql
sum by (network, result) (rate(council_daemon_http_rpc_requests_total[1m]))
```

### P95 Response Time

```promql
histogram_quantile(0.95, sum by (le, network) (rate(council_daemon_http_rpc_response_seconds_bucket[5m])))
```

### RPC Methods Distribution

```promql
topk(10, sum by (method) (rate(council_daemon_rpc_request_total[5m])))
```

### Error Rate

```promql
sum(rate(council_daemon_http_rpc_requests_total{result="fail"}[5m]))
/
sum(rate(council_daemon_http_rpc_requests_total[5m]))
```

### Batch Size Distribution

```promql
histogram_quantile(0.5, sum by (le) (rate(council_daemon_http_rpc_batch_size_bucket[5m])))
```

### Payload Sizes

```promql
# Average request size
rate(council_daemon_http_rpc_request_payload_bytes_sum[5m]) / rate(council_daemon_http_rpc_request_payload_bytes_count[5m])

# Average response size
rate(council_daemon_http_rpc_response_payload_bytes_sum[5m]) / rate(council_daemon_http_rpc_response_payload_bytes_count[5m])
```

## Troubleshooting

### Metrics not appearing

1. Check if the application started successfully:
   ```bash
   curl http://localhost:3004/health
   ```

2. Check RpcMetricsService logs for initialization:
   ```
   RPC metrics initialized for ethereum/el (chainId: ...)
   RPC metrics initialized for data-bus/el (chainId: ...)
   ```

3. Verify Prometheus can reach the application:
   - Open http://localhost:9090/targets
   - Check if `council-daemon` target is UP

### No data in Grafana

1. Verify Prometheus datasource is configured correctly
2. Check if Prometheus is scraping metrics: http://localhost:9090/graph
3. Wait for scrape interval (5 seconds)

## Cleanup

```bash
docker-compose -f docker-compose.metrics.yml down
```
