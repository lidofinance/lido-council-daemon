#!/bin/bash

# RPC Metrics Verification Script
# Usage: ./scripts/check-rpc-metrics.sh [port]

PORT=${1:-3004}
BASE_URL="http://localhost:${PORT}/metrics"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  RPC Metrics Verification"
echo "  Target: ${BASE_URL}"
echo "=========================================="
echo ""

# Check if metrics endpoint is available
if ! curl -s --fail "${BASE_URL}" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Cannot reach metrics endpoint at ${BASE_URL}${NC}"
    echo "Make sure the application is running on port ${PORT}"
    exit 1
fi

echo -e "${GREEN}Metrics endpoint is accessible${NC}"
echo ""

# Fetch metrics once
METRICS=$(curl -s "${BASE_URL}")

# Define expected metrics
EXPECTED_METRICS=(
    "council_daemon_http_rpc_requests_total"
    "council_daemon_http_rpc_batch_size"
    "council_daemon_http_rpc_response_seconds"
    "council_daemon_http_rpc_request_payload_bytes"
    "council_daemon_http_rpc_response_payload_bytes"
    "council_daemon_rpc_request_total"
)

echo "Checking RPC metrics registration..."
echo "-----------------------------------"

all_found=true
for metric in "${EXPECTED_METRICS[@]}"; do
    if echo "$METRICS" | grep -q "^# HELP ${metric}"; then
        echo -e "${GREEN}[REGISTERED]${NC} ${metric}"
    else
        echo -e "${YELLOW}[NOT FOUND]${NC} ${metric}"
        all_found=false
    fi
done

echo ""
echo "Checking for actual metric data..."
echo "-----------------------------------"

has_data=false
for metric in "${EXPECTED_METRICS[@]}"; do
    count=$(echo "$METRICS" | grep -c "^${metric}")
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}[HAS DATA]${NC} ${metric}: ${count} series"
        has_data=true
    fi
done

if [ "$has_data" = false ]; then
    echo -e "${YELLOW}No metric data yet. This is normal if no RPC calls have been made.${NC}"
fi

echo ""
echo "Network breakdown..."
echo "-----------------------------------"

# Check for ethereum network metrics
eth_count=$(echo "$METRICS" | grep -c 'network="ethereum"')
databus_count=$(echo "$METRICS" | grep -c 'network="data-bus"')

echo "Ethereum network metrics: ${eth_count}"
echo "Data-bus network metrics: ${databus_count}"

echo ""
echo "Sample metrics output..."
echo "-----------------------------------"
echo "$METRICS" | grep "council_daemon_http_rpc" | head -20

echo ""
echo "=========================================="
if [ "$all_found" = true ]; then
    echo -e "${GREEN}All RPC metrics are registered!${NC}"
else
    echo -e "${YELLOW}Some metrics are not yet registered.${NC}"
    echo "They will appear after RPC calls are made."
fi
echo "=========================================="
