#!/bin/bash

# Start Prometheus + Grafana metrics stack
# Usage: ./scripts/start-metrics-stack.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Starting metrics stack..."

docker-compose -f docker-compose.metrics.yml up -d

echo ""
echo -e "${GREEN}Metrics stack is running!${NC}"
echo ""
echo "Services:"
echo "  - Prometheus: http://localhost:9090"
echo "  - Grafana:    http://localhost:8001 (admin/admin)"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Start the application: yarn start:dev"
echo "  2. Check metrics: ./scripts/check-rpc-metrics.sh"
echo "  3. Open Prometheus: http://localhost:9090/targets"
echo ""
echo "To stop: docker-compose -f docker-compose.metrics.yml down"
