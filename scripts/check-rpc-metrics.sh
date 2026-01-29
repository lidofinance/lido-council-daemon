#!/bin/bash

# Metrics Verification Script
# Usage: ./scripts/check-rpc-metrics.sh [port]

PORT=${1:-3004}
BASE_URL="http://localhost:${PORT}/metrics"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  Guardian Metrics Verification"
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

# Define expected metrics by category
RPC_METRICS=(
    "council_daemon_http_rpc_requests_total"
    "council_daemon_http_rpc_batch_size"
    "council_daemon_http_rpc_response_seconds"
    "council_daemon_http_rpc_request_payload_bytes"
    "council_daemon_http_rpc_response_payload_bytes"
    "council_daemon_rpc_request_total"
)

NONCE_METRICS=(
    "council_daemon_nonce_latest"
    "council_daemon_nonce_pending"
    "council_daemon_nonce_gap"
)

CACHE_METRICS=(
    "council_daemon_deposits_cache_bytes"
    "council_daemon_deposits_cache_count"
    "council_daemon_signing_keys_cache_bytes"
    "council_daemon_signing_keys_cache_count"
)

MESSAGE_METRICS=(
    "council_daemon_sent_messages_total"
)

check_metrics() {
    local category=$1
    shift
    local metrics=("$@")

    echo -e "${CYAN}${category}${NC}"
    echo "-----------------------------------"

    local all_found=true
    for metric in "${metrics[@]}"; do
        if echo "$METRICS" | grep -q "^# HELP ${metric}"; then
            count=$(echo "$METRICS" | grep -c "^${metric}")
            if [ "$count" -gt 0 ]; then
                echo -e "${GREEN}[OK]${NC} ${metric} (${count} series)"
            else
                echo -e "${GREEN}[REGISTERED]${NC} ${metric} (no data yet)"
            fi
        else
            echo -e "${YELLOW}[NOT FOUND]${NC} ${metric}"
            all_found=false
        fi
    done
    echo ""

    if [ "$all_found" = true ]; then
        return 0
    else
        return 1
    fi
}

# Check each category
echo ""
check_metrics "Phase 1: RPC Metrics" "${RPC_METRICS[@]}"
rpc_ok=$?

check_metrics "Phase 2: Nonce Metrics" "${NONCE_METRICS[@]}"
nonce_ok=$?

check_metrics "Phase 3: Events Cache Metrics" "${CACHE_METRICS[@]}"
cache_ok=$?

check_metrics "Phase 4: Message Metrics" "${MESSAGE_METRICS[@]}"
message_ok=$?

echo "Network breakdown..."
echo "-----------------------------------"

# Check for ethereum network metrics
eth_count=$(echo "$METRICS" | grep -c 'network="ethereum"')
databus_count=$(echo "$METRICS" | grep -c 'network="data-bus"')

echo "Ethereum network metrics: ${eth_count}"
echo "Data-bus network metrics: ${databus_count}"

echo ""
echo "Sample nonce metrics..."
echo "-----------------------------------"
echo "$METRICS" | grep "council_daemon_nonce" | head -10

echo ""
echo "Sample cache metrics..."
echo "-----------------------------------"
echo "$METRICS" | grep "council_daemon_deposits_cache\|council_daemon_signing_keys_cache" | head -10

echo ""
echo "=========================================="
if [ $rpc_ok -eq 0 ] && [ $nonce_ok -eq 0 ] && [ $cache_ok -eq 0 ] && [ $message_ok -eq 0 ]; then
    echo -e "${GREEN}All metrics are registered!${NC}"
else
    echo -e "${YELLOW}Some metrics are not yet registered.${NC}"
    echo "They will appear after the corresponding operations occur."
fi
echo "=========================================="
