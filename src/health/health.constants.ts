import { getHeapStatistics } from 'v8';

export const MAX_BLOCK_DELAY_SECONDS = 5 * 60;

export const MAX_MEMORY_HEAP = getHeapStatistics().heap_size_limit;
